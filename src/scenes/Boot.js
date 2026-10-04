import Phaser from 'phaser';
import { CFG } from '../config.js';
import { ensureSkin, makeAllArt } from '../art.js';
import { Save } from '../services/save.js';
import dsLogo from '../assets/ds_logo.png';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  preload() {
    this.load.image('ds_logo', dsLogo);
  }
  create() {
    Save.load();
    const q = new URLSearchParams(location.search);
    // the studio splash builds the game art while it shows; tests skip it with ?play or ?nosplash
    if (!q.has('play') && !q.has('nosplash')) {
      this.scene.start('Splash');
      return;
    }
    const go = () => {
      makeAllArt(this, CFG.W, CFG.H);
      ensureSkin(this, Save.data.equipped);
      // ?play=1 skips the menu (used by automated tests); normal players land on the menu
      this.scene.start(q.has('play') ? 'Game' : 'Menu');
    };
    // wait (briefly) for the UI font; fall back to system fonts if it cannot load
    try {
      const wait = new Promise((r) => setTimeout(r, 1500));
      Promise.race([Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('500 14px Fredoka')]), wait]).then(go, go);
    } catch {
      go();
    }
  }
}
