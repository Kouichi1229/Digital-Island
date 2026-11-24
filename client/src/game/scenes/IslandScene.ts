import Phaser from "phaser";
import { gameClock } from "../GameClock";

const DIRECTIONS = ["down", "up", "left", "right"] as const;

const TILESETS = [
  {
    name: "Nature_CoconutTrees — CoconutTrees",
    key: "coconut-trees",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Nature/CoconutTrees.png",
  },
  {
    name: "Nature_PineTrees — PineTrees",
    key: "pine-trees",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Nature/PineTrees.png",
  },
  {
    name: "Nature_Rocks — Rocks",
    key: "nature-rocks",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Nature/Rocks.png",
  },
  {
    name: "Nature_Trees — Trees",
    key: "nature-trees",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Nature/Trees.png",
  },
  {
    name: "Terrain_Cliff",
    key: "terrain-cliff",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/Cliff.png",
  },
  {
    name: "Terrain_CliffWater",
    key: "terrain-cliff-water",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/Cliff-Water.png",
  },
  {
    name: "Terrain_DeadGrass",
    key: "terrain-dead-grass",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/DeadGrass.png",
  },
  {
    name: "Terrain_Grass",
    key: "terrain-grass",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/Grass.png",
  },
  {
    name: "Terrain_Shore",
    key: "terrain-shore",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/Shore.png",
  },
  {
    name: "Terrain_TexturedGrass",
    key: "terrain-textured-grass",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/TexturedGrass.png",
  },
  {
    name: "Terrain_Winter",
    key: "terrain-winter",
    path: "assets/tilesets/miniworld/MiniWorldSprites/Ground/Winter.png",
  },
];

const LAYERS = [
  "Ocean",
  "Shore",
  "Island_Ground",
  "Cliff_Details",
  "Rocks",
  "Nature",
];

type LightingKeyframe = {
  minute: number;
  color: number;
  alpha: number;
};

const LIGHTING_KEYFRAMES: LightingKeyframe[] = [
  { minute: 0, color: 0x17284b, alpha: 0.38 },
  { minute: 330, color: 0x17284b, alpha: 0.38 },
  { minute: 360, color: 0xf6d99b, alpha: 0.16 },
  { minute: 540, color: 0xffffff, alpha: 0 },
  { minute: 990, color: 0xffffff, alpha: 0 },
  { minute: 1020, color: 0xd58a65, alpha: 0.18 },
  { minute: 1140, color: 0x263653, alpha: 0.4 },
  { minute: 1440, color: 0x17284b, alpha: 0.38 },
];

function interpolateColor(start: number, end: number, t: number) {
  const r1 = (start >> 16) & 0xff;
  const g1 = (start >> 8) & 0xff;
  const b1 = start & 0xff;

  const r2 = (end >> 16) & 0xff;
  const g2 = (end >> 8) & 0xff;
  const b2 = end & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return (r << 16) | (g << 8) | b;
}

function getLighting(totalMinutes: number) {
  const index = LIGHTING_KEYFRAMES.findIndex(
    (frame, i) =>
      i < LIGHTING_KEYFRAMES.length - 1 &&
      totalMinutes >= frame.minute &&
      totalMinutes < LIGHTING_KEYFRAMES[i + 1].minute,
  );

  const current = LIGHTING_KEYFRAMES[index];
  const next = LIGHTING_KEYFRAMES[index + 1];

  const progress =
    (totalMinutes - current.minute) / (next.minute - current.minute);

  return {
    color: interpolateColor(current.color, next.color, progress),
    alpha: current.alpha + (next.alpha - current.alpha) * progress,
  };
}

export class IslandScene extends Phaser.Scene {
  private lightOverlay!: Phaser.GameObjects.Graphics;
  private lumi!: Phaser.Physics.Arcade.Sprite;
  constructor() {
    super("IslandScene");
  }

  private updateLumiMovement() {
    const keyboard = this.input.keyboard;

    if (!keyboard || !this.lumi) {
      return;
    }

    const keys = keyboard.createCursorKeys();

    const speed = 100;
    let velocityX = 0;
    let velocityY = 0;

    if (keys.left.isDown) velocityX = -speed;
    if (keys.right.isDown) velocityX = speed;
    if (keys.up.isDown) velocityY = -speed;
    if (keys.down.isDown) velocityY = speed;

    if (velocityX !== 0 && velocityY !== 0) {
      velocityX *= Math.SQRT1_2;
      velocityY *= Math.SQRT1_2;
    }

    this.lumi.setVelocity(velocityX, velocityY);
  }

  preload() {
    this.load.tilemapTiledJSON(
      "island-map",
      "assets/maps/island_v2_phaser.json",
    );

    for (const tileset of TILESETS) {
      this.load.image(tileset.key, tileset.path);
    }

    this.load.image(
      "meat-farm-seedling",
      "assets/food/meat-farm/stage_1_seedling.png",
    );

    this.load.image(
      "meat-farm-growing",
      "assets/food/meat-farm/stage_2_growing.png",
    );

    this.load.image(
      "meat-farm-mature",
      "assets/food/meat-farm/stage_3_mature.png",
    );

    this.load.image(
      "meat-farm-harvested",
      "assets/food/meat-farm/stage_4_harvested.png",
    );

    for (const direction of DIRECTIONS) {
      for (let i = 0; i < 4; i++) {
        const key = `lumi-${direction}-${i}`;

        this.load.image(
          key,
          `assets/creatures/lumi/frames/walk-${direction}/frame-${String(i).padStart(2, "0")}.png`,
        );
      }
    }
  }

  create() {
    const map = this.make.tilemap({ key: "island-map" });

    const tilesets = TILESETS.map(({ name, key }) => {
      const tileset = map.addTilesetImage(name, key);

      if (!tileset) {
        throw new Error(`Failed to load tileset: ${name}`);
      }

      return tileset;
    });

    const collisionLayers = LAYERS.map((layerName) => {
      const layer = map.createLayer(layerName, tilesets, 0, 0);

      if (!layer) {
        throw new Error(`Failed to create map layer: ${layerName}`);
      }

      layer.setCollisionByProperty({ blocked: true });

      return layer;
    });

    for (const direction of DIRECTIONS) {
      this.anims.create({
        key: `lumi-walk-${direction}`,
        frames: Array.from({ length: 4 }, (_, i) => ({
          key: `lumi-${direction}-${i}`,
        })),
        frameRate: 6,
        repeat: -1,
      });
    }
    const meatFarm = this.add.image(528, 480, "meat-farm-mature");

    meatFarm.setOrigin(0.5, 1);
    meatFarm.setScale(0.075);
    meatFarm.setDepth(9);

    this.physics.add.existing(meatFarm, true);

    this.lumi = this.physics.add.sprite(640, 480, "lumi-down-0");

    this.lumi.setOrigin(0.5, 1);
    this.lumi.setScale(0.375);
    this.lumi.setDepth(10);

    const body = this.lumi.body as Phaser.Physics.Arcade.Body;

    body.setSize(32, 20);
    body.setOffset(24, 58);
    body.setCollideWorldBounds(true);

    for (const layer of collisionLayers) {
      this.physics.add.collider(this.lumi, layer);
    }

    this.physics.add.collider(this.lumi, meatFarm);

    this.lumi.play("lumi-walk-down");

    this.input.keyboard?.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    });

    console.log("DigitalIsland V2 map loaded!");
    console.log("Lumi initialized!");
    console.log("Map dimensions:", map.width, "x", map.height);
    this.lightOverlay = this.add.graphics();
    this.lightOverlay.setScrollFactor(0);
    this.lightOverlay.setDepth(1000);

    this.updateLighting();
  }

  update() {
    gameClock.advanceTo();
    this.updateLighting();
    this.updateLumiMovement();
  }

  private updateLighting() {
    if (!this.lightOverlay) {
      return;
    }

    const snapshot = gameClock.getSnapshot();
    const lighting = getLighting(snapshot.totalMinutes);

    this.lightOverlay.clear();
    this.lightOverlay.fillStyle(lighting.color, lighting.alpha);
    this.lightOverlay.fillRect(0, 0, 1280, 960);
  }
}
