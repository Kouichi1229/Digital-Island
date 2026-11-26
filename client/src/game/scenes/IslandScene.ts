import Phaser from "phaser";
import { gameClock } from "../GameClock";
import {
  perceiveEnvironment,
  type EnvironmentSnapshot,
} from "../EnvironmentPerception";
import { recordEnvironment } from "../EnvironmentRecorder";
import { recordCollision } from "../EnvironmentRecorder";
import { recordUpdateDiagnostic } from "../DiagnosticsRecorder";

export type LumiDirection = "up" | "down" | "left" | "right";

export type LumiSnapshot = {
  x: number;
  y: number;
  direction: LumiDirection;
  isMoving: boolean;
  gameTime: string;
  environment: EnvironmentSnapshot;
};

export type LumiActionExecution = {
  actionId: string;
  action: "move_up" | "move_down" | "move_left" | "move_right" | "stop";
  durationSeconds: number;
};

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

  private mapLayers: (
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer
  )[] = [];

  private lumiDirection: LumiDirection = "down";

  private lastSnapshotTime = 0;
  private lastEnvironmentRecordTime = 0;

  private recordedCollisionTiles = new Set<string>();

  private activeAction: LumiActionExecution | null = null;

  private actionElapsedMs = 0;

  private lastActionUpdateTime: number | null = null;

  private visibilityHandler?: () => void;

  constructor() {
    super("IslandScene");
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

    this.mapLayers = LAYERS.map((layerName) => {
      const layer = map.createLayer(layerName, tilesets, 0, 0);

      if (!layer) {
        throw new Error(`Failed to create map layer: ${layerName}`);
      }

      layer.setCollisionByProperty({ blocked: true });

      return layer;
    });

    console.log(
      "Map Layer Types:",
      this.mapLayers.map((layer) => ({
        name: layer.layer.name,
        type: layer.constructor.name,
      })),
    );

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

    body.onCollide = true;

    body.setSize(32, 20);
    body.setOffset(24, 58);
    body.setCollideWorldBounds(true);

    for (const layer of this.mapLayers) {
      this.physics.add.collider(this.lumi, layer);
    }

    this.physics.world.on(
      "tilecollide",
      (
        gameObject: Phaser.GameObjects.GameObject,
        tile: Phaser.Tilemaps.Tile,
        _body: Phaser.Physics.Arcade.Body,
      ) => {
        if (gameObject !== this.lumi) {
          return;
        }

        const collisionKey = `${tile.layer.name}:${tile.x}:${tile.y}:${tile.index}`;

        if (this.recordedCollisionTiles.has(collisionKey)) {
          return;
        }

        this.recordedCollisionTiles.add(collisionKey);

        recordCollision({
          timestamp: new Date().toISOString(),
          gameTime: gameClock.getSnapshot().formattedTime,
          lumiX: this.lumi.x,
          lumiY: this.lumi.y,
          targetType: "tile",
          layer: tile.layer.name,
          tileIndex: tile.index,
          targetX: tile.getCenterX(),
          targetY: tile.getCenterY(),
        });
      },
    );

    this.physics.add.collider(this.lumi, meatFarm);

    // 初始保持靜止，不播放走路動畫。
    this.lumi.setTexture("lumi-down-0");

    console.log("DigitalIsland V2 map loaded!");
    console.log("Lumi initialized!");
    console.log("Map dimensions:", map.width, "x", map.height);

    this.lightOverlay = this.add.graphics();
    this.lightOverlay.setScrollFactor(0);
    this.lightOverlay.setDepth(1000);

    // 背景分頁時暫停移動與行動計時。
    this.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        this.lumi.setVelocity(0, 0);
        this.lastActionUpdateTime = null;
        return;
      }

      if (this.activeAction) {
        this.lastActionUpdateTime = performance.now();
        this.applyActiveActionMovement();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.visibilityHandler) {
        document.removeEventListener(
          "visibilitychange",
          this.visibilityHandler,
        );
      }

      this.lumi.setVelocity(0, 0);
      this.activeAction = null;
      this.lastActionUpdateTime = null;
    });

    this.updateLighting();
    // 通知 GameCanvas：Lumi 與遊戲環境已完成初始化。
    this.events.emit("lumi-ready");
  }

  /**
   * 由 GameCanvas 呼叫，讓 Phaser 執行 Backend 核准的行動。
   */
  startLumiAction(action: LumiActionExecution): void {
    if (this.activeAction !== null) {
      throw new Error("Lumi is already executing an action");
    }

    if (
      typeof action.actionId !== "string" ||
      action.actionId.length === 0 ||
      !Number.isFinite(action.durationSeconds) ||
      action.durationSeconds < 180 ||
      action.durationSeconds > 300
    ) {
      throw new Error("Invalid Lumi action execution data");
    }

    const validActions = [
      "move_up",
      "move_down",
      "move_left",
      "move_right",
      "stop",
    ];

    if (!validActions.includes(action.action)) {
      throw new Error("Invalid Lumi action type");
    }

    this.activeAction = action;
    this.actionElapsedMs = 0;

    this.lastActionUpdateTime =
      document.visibilityState === "visible" ? performance.now() : null;

    this.applyActiveActionMovement();
  }

  /**
   * 根據目前行動設定 Lumi 的速度與動畫。
   */
  private applyActiveActionMovement(): void {
    if (!this.activeAction || !this.lumi) {
      return;
    }

    if (document.visibilityState === "hidden") {
      this.lumi.setVelocity(0, 0);
      return;
    }

    const speed = 100;

    switch (this.activeAction.action) {
      case "move_up":
        this.lumiDirection = "up";
        this.lumi.setVelocity(0, -speed);
        break;

      case "move_down":
        this.lumiDirection = "down";
        this.lumi.setVelocity(0, speed);
        break;

      case "move_left":
        this.lumiDirection = "left";
        this.lumi.setVelocity(-speed, 0);
        break;

      case "move_right":
        this.lumiDirection = "right";
        this.lumi.setVelocity(speed, 0);
        break;

      case "stop":
        this.lumi.setVelocity(0, 0);
        this.lumi.anims.stop();
        this.lumi.setTexture(`lumi-${this.lumiDirection}-0`);
        return;
    }

    this.lumi.play(`lumi-walk-${this.lumiDirection}`, true);
  }

  /**
   * 行動時間結束後停止 Lumi，並回報 actionId。
   */
  private finishLumiAction(): void {
    if (!this.activeAction) {
      return;
    }

    const actionId = this.activeAction.actionId;

    this.lumi.setVelocity(0, 0);
    this.lumi.anims.stop();
    this.lumi.setTexture(`lumi-${this.lumiDirection}-0`);

    this.activeAction = null;
    this.actionElapsedMs = 0;
    this.lastActionUpdateTime = null;

    this.events.emit("lumi-action-completed", actionId);
  }

  getLumiSnapshot(): LumiSnapshot | null {
    if (!this.lumi || !this.lumi.body) {
      return null;
    }

    const body = this.lumi.body as Phaser.Physics.Arcade.Body;
    const gameTime = gameClock.getSnapshot();

    const environment = perceiveEnvironment(
      this.mapLayers,
      this.lumi.x,
      this.lumi.y,
    );

    const now = this.time.now;

    if (now - this.lastEnvironmentRecordTime >= 1000) {
      this.lastEnvironmentRecordTime = now;

      recordEnvironment(
        {
          x: this.lumi.x,
          y: this.lumi.y,
          direction: this.lumiDirection,
          isMoving: body.velocity.lengthSq() > 0,
          gameTime: gameTime.formattedTime,
        },
        environment,
      );
    }

    return {
      x: this.lumi.x,
      y: this.lumi.y,
      direction: this.lumiDirection,
      isMoving: body.velocity.lengthSq() > 0,
      gameTime: gameTime.formattedTime,
      environment,
    };
  }

  update() {
    recordUpdateDiagnostic();

    gameClock.advanceTo();
    this.updateLighting();

    // 只計算瀏覽器前景期間實際經過的時間。
    if (this.activeAction && document.visibilityState === "visible") {
      const now = performance.now();

      if (this.lastActionUpdateTime !== null) {
        const elapsed = Math.max(0, now - this.lastActionUpdateTime);

        this.actionElapsedMs += elapsed;
      }

      this.lastActionUpdateTime = now;

      if (this.actionElapsedMs >= this.activeAction.durationSeconds * 1000) {
        this.finishLumiAction();
      }
    }

    const now = this.time.now;

    if (now - this.lastSnapshotTime >= 200) {
      this.lastSnapshotTime = now;

      const snapshot = this.getLumiSnapshot();

      if (snapshot) {
        this.events.emit("lumi-snapshot", snapshot);
      }
    }
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
