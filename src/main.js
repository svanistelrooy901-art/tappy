import Phaser from 'phaser';
import { CFG } from './config.js';
import { BootScene } from './scenes/Boot.js';
import { GameScene } from './scenes/Game.js';
import { MenuScene } from './scenes/Menu.js';
import { SplashScene } from './scenes/Splash.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CFG.W * CFG.Z,
  height: CFG.H * CFG.Z,
  backgroundColor: '#0a0620',
  pixelArt: false, // smooth art; the pixel alien opts into NEAREST per texture
  antialias: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 1 },
  fps: { target: 60 },
  scene: [BootScene, SplashScene, MenuScene, GameScene],
});

window.__tappyGame = game;
