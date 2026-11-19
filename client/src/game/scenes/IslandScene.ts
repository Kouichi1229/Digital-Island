import Phaser from "phaser";

export class IslandScene extends Phaser.Scene {
  constructor() {
    super("IslandScene");
  }

  preload() {
    this.load.tilemapTiledJSON(
      "island-map",
      "assets/maps/island_v1_phaser.json",
    );

    this.load.image(
      "base-terrain",
      "assets/tilesets/terrain/digitalisland_base_terrain_32px.png",
    );
  }

  create() {
    const map = this.make.tilemap({
      key: "island-map",
    });

    const tileset = map.addTilesetImage("base_terrain", "base-terrain");

    if (!tileset) {
      throw new Error("Failed to load base_terrain tileset");
    }

    map.createLayer("Ground", tileset, 0, 0);
    map.createLayer("Cliffs", tileset, 0, 0);

    console.log("DigitalIsland map loaded!");
    console.log("Map dimensions:", map.width, "x", map.height);
  }
}
