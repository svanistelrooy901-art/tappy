import Phaser from 'phaser';
import { UIScene, HD } from './UIScene.js';
import { CFG } from '../config.js';
import { ensureSkin, makeAllArt } from '../art.js';
import { Save } from '../services/save.js';

const { W, H } = CFG;
export const SPLASH_RED = '#D62617'; // Digital Sambal brand red (same as the website)
const MUSTARD = '#F2B01E';

// Studio splash: the Digital Sambal logo on brand red. The game's art is built while it shows,
// so the splash hides the load time instead of adding to it. Tap to skip once it is ready.
export class SplashScene extends UIScene {
  constructor() {
    super('Splash');
  }

  create() {
    this.initUI();
    this.cameras.main.setBackgroundColor(SPLASH_RED);
    this.ready = false;
    this.leaving = false;

    const cx = W / 2, cy = 282;
    const logoW = 276;
    const k = logoW / 600; // logical px per logo texel (texture is 600 px wide)
    this.logo = this.add.image(cx, cy, 'ds_logo').setScale(k * 0.88).setAlpha(0);
    this.hudLayer.add(this.logo);
    this.k = k;
    this.cy = cy;

    this.input.once('pointerdown', () => this.ready && this.leave());
    // first frame is on screen; now do the heavy work
    this.time.delayedCall(60, () => this.prepare());
  }

  async prepare() {
    try {
      const wait = new Promise((r) => setTimeout(r, 1500));
      await Promise.race([Promise.all([document.fonts.load('700 20px Fredoka'), document.fonts.load('500 14px Fredoka')]), wait]);
    } catch {}
    makeAllArt(this, W, H);
    ensureSkin(this, Save.data.equipped);
    this.ready = true;
    this.play();
  }

  play() {
    // soft shadow under the card ('glow' is part of the generated art, so it exists only now)
    this.shadow = this.add.image(W / 2, this.cy + 16, 'glow').setTint(0x000000).setAlpha(0).setScale(HD * 5.2, HD * 3.4);
    this.hudLayer.addAt(this.shadow, 0);
    // tagline (font is loaded by now)
    const tag = this.text(W / 2, this.cy + 168, 'LOCAL TASTE, GLOBAL AMBITION', 12, MUSTARD, [0.5, 0.5], this.hudLayer, 700);
    tag.setLetterSpacing?.(2.5);
    tag.setAlpha(0);

    this.tweens.add({ targets: this.logo, alpha: 1, scale: this.k, duration: 560, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.shadow, alpha: 0.28, duration: 560 });
    this.tweens.add({ targets: tag, alpha: 0.95, y: tag.y - 4, duration: 420, delay: 380 });
    // gentle breathing while it holds
    this.time.delayedCall(620, () => {
      if (this.leaving) return;
      this.tweens.add({ targets: this.logo, scale: this.k * 1.018, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    this.time.delayedCall(2000, () => this.leave());
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(260, 10, 6, 32);
    this.time.delayedCall(280, () => this.scene.start('Menu'));
  }
}
