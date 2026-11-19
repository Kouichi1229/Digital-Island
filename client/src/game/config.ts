import Phaser from 'phaser'
import { IslandScene } from './scenes/IslandScene'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  width: 1280,
  height: 960,

  backgroundColor: '#163b59',

  parent: 'game-container',

  pixelArt: true,
  antialias: false,
  roundPixels: true,

  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  scene: [IslandScene],
}
