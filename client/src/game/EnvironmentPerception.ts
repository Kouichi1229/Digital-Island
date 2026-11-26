import Phaser from "phaser";

export type EnvironmentTileObservation = {
  layer: string;
  tileIndex: number;
  x: number;
  y: number;
  distance: number;
  isCollidable: boolean;
};

export type EnvironmentSnapshot = {
  centerX: number;
  centerY: number;
  radius: number;
  nearbyTiles: EnvironmentTileObservation[];
};

type MapLayer = Phaser.Tilemaps.TilemapLayer | Phaser.Tilemaps.TilemapGPULayer;

export function perceiveEnvironment(
  layers: MapLayer[],
  centerX: number,
  centerY: number,
  radius = 96,
): EnvironmentSnapshot {
  const nearbyTiles: EnvironmentTileObservation[] = [];

  for (const layer of layers) {
    const tiles = layer.getTilesWithinWorldXY(
      centerX - radius,
      centerY - radius,
      radius * 2,
      radius * 2,
    );

    if (!tiles) {
      continue;
    }

    for (const tile of tiles) {
      if (!tile || tile.index === -1) {
        continue;
      }

      const x = tile.getCenterX();
      const y = tile.getCenterY();

      const distance = Phaser.Math.Distance.Between(centerX, centerY, x, y);

      if (distance > radius) {
        continue;
      }

      nearbyTiles.push({
        layer: layer.layer.name,
        tileIndex: tile.index,
        x,
        y,
        distance: Math.round(distance * 100) / 100,
        isCollidable: tile.isInteresting(true, false),
      });
    }
  }

  return {
    centerX,
    centerY,
    radius,
    nearbyTiles,
  };
}
