import Phaser from 'phaser';
import { CFG } from '../config.js';
import { FONT, uiButtonKey, uiPanelKey } from '../art_hd.js';
import { sfx, unlockAudio } from '../services/sfx.js';

const { W, H, Z } = CFG;
export const HD = 1 / Z; // hi-res textures are displayed at 1/Z so one texel = one screen pixel
export const OFFX = (W * (Z - 1)) / 2; // camera-zoom compensation for screen-fixed (scrollFactor 0) layers
export const OFFY = (H * (Z - 1)) / 2;

// Shared base for every scene: hi-res zoomed camera, screen-fixed layers, text, glass panels, buttons.
// All coordinates handed to these helpers are LOGICAL (360 x 640).
export class UIScene extends Phaser.Scene {
  initUI() {
    this.cameras.main.setBackgroundColor('#0a0620').setZoom(Z);
    const layer = (d) => this.add.container(OFFX, OFFY).setScrollFactor(0).setDepth(d);
    this.bgLayer = layer(-100);
    this.fgLayer = layer(40);
    this.hudLayer = layer(100);
    this.ovLayer = layer(200);
    this.buttons = [];
    this.ov = [];
  }

  // create a text object; added to a layer unless layer === null
  text(x, y, s, size = 16, color = '#ffffff', origin = [0.5, 0.5], layer = this.hudLayer, weight = 700) {
    const t = this.make
      .text(
        {
          x,
          y,
          text: s,
          style: {
            fontFamily: FONT,
            fontSize: `${size}px`,
            fontStyle: String(weight),
            color,
            resolution: Z,
            shadow: { offsetX: 0, offsetY: Math.max(1, size / 14), color: 'rgba(5,0,25,0.65)', blur: Math.max(3, size / 4), fill: true, stroke: false },
          },
        },
        false
      )
      .setOrigin(origin[0], origin[1]);
    if (layer) layer.add(t);
    return t;
  }

  // ---- overlay content (cards, buttons...) that can be thrown away together
  addOv(o) {
    this.ovLayer.add(o);
    this.ov.push(o);
    return o;
  }
  hideOverlay() {
    this.overlayCleanup?.();
    this.overlayCleanup = null;
    this.ov?.forEach((o) => o.destroy());
    this.ov = [];
    this.buttons = [];
  }
  // dim scrim + (optional) glass card centred on screen
  panel(cardW, cardH, cy = H / 2, dim = 0.66) {
    this.hideOverlay();
    if (dim > 0) this.addOv(this.add.rectangle(W / 2, H / 2, W, H, 0x04020f, dim));
    if (cardW) this.addOv(this.add.image(W / 2, cy, uiPanelKey(this, cardW, cardH)).setScale(HD));
    this.ovLayer.setAlpha(0);
    this.tweens.add({ targets: this.ovLayer, alpha: 1, duration: 160 });
  }
  ovText(x, y, s, size, color, weight = 700) {
    return this.addOv(this.text(x, y, s, size, color, [0.5, 0.5], null, weight));
  }
  button(label, x, y, w, h, tone, cb) {
    const img = this.addOv(this.add.image(x, y, uiButtonKey(this, w, h, tone)).setScale(HD));
    const t = this.addOv(this.text(x, y - 1, label, h >= 54 ? 20 : 17, '#ffffff', [0.5, 0.5], null));
    this.buttons.push({ x, y, w, h, cb, img, t });
    return { img, t };
  }
  // round icon button (texture key must exist), with an optional small label under it
  iconButton(iconKey, x, y, size, cb, label) {
    const img = this.addOv(this.add.image(x, y, iconKey).setScale(HD));
    if (label) this.ovText(x, y + size / 2 + 9, label, 11, '#cfc8ff', 500);
    this.buttons.push({ x, y, w: size, h: size, cb, img, t: null });
    return { img };
  }
  // an invisible tap area (for cards, swatches...)
  hit(x, y, w, h, cb, img = null) {
    // immediate (no press animation): used for cards and swatches
    this.buttons.push({ x, y, w, h, cb, press: false, img, t: null });
  }

  // returns true if the tap was consumed by an overlay/button layer
  handleButtons(pointer) {
    unlockAudio();
    if (!this.buttons.length) return false;
    const px = pointer.x / Z;
    const py = pointer.y / Z;
    for (const b of this.buttons) {
      if (Math.abs(px - b.x) <= b.w / 2 && Math.abs(py - b.y) <= b.h / 2) {
        sfx.ui();
        const live = this.buttons;
        if (b.press !== false) {
          this.buttons = []; // ignore further taps while the press animation plays
          if (b.img) this.tweens.add({ targets: [b.img], scale: HD * 0.94, duration: 70, yoyo: true });
          if (b.t) this.tweens.add({ targets: [b.t], scale: 0.94, duration: 70, yoyo: true });
          this.time.delayedCall(120, () => {
            b.cb();
            // the callback did not rebuild/close the screen (e.g. a toast): keep its buttons live
            if (!this.buttons.length && this.ov.length) this.buttons = live;
          });
        } else {
          b.cb();
        }
        return true;
      }
    }
    return true;
  }

  // small floating message near the bottom (e.g. "Coming soon")
  toast(msg) {
    this.toastObj?.destroy();
    const t = this.text(W / 2, H - 74, msg, 14, '#ffffff', [0.5, 0.5], this.ovLayer, 500);
    this.toastObj = t;
    this.tweens.add({ targets: t, alpha: { from: 1, to: 0 }, y: t.y - 14, duration: 1400, delay: 500, onComplete: () => t.destroy() });
  }
}
