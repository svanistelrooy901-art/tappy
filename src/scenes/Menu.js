import Phaser from 'phaser';
import { UIScene, HD } from './UIScene.js';
import { SpaceBackground } from '../background.js';
import { SKINS, alienKey, ensureSkin } from '../art.js';
import { PLAT_H, PLAT_TOP, platformKey, uiCardKey, uiPanelKey } from '../art_hd.js';
import { SKIN_CATALOG, formatMYR, skinById } from '../data/cosmetics.js';
import { StoreService } from '../services/store.js';
import { CFG } from '../config.js';
import { Save } from '../services/save.js';
import { sfx } from '../services/sfx.js';

const { W, H } = CFG;
const tintOf = (skin) => parseInt((SKINS[skin] || SKINS.default).body.slice(1), 16);

export class MenuScene extends UIScene {
  constructor() {
    super('Menu');
  }

  create() {
    this.initUI();
    this.space = new SpaceBackground(this, this.bgLayer, this.fgLayer);
    this.camT = 0;
    this.selected = Save.data.equipped;
    this.input.on('pointerdown', (p) => this.handleButtons(p), this);
    this.cameras.main.fadeIn(220, 10, 6, 32);
    this.showHome();
    window.__tappy = { scene: this };
  }

  update(time, delta) {
    this.camT -= delta * 0.012; // slow upward drift
    this.space.update(this.camT, time / 1000);
  }

  // ------------------------------------------------------------------ shared bits
  startGame() {
    this.cameras.main.fadeOut(160, 10, 6, 32);
    this.time.delayedCall(170, () => this.scene.start('Game'));
  }

  coinPill(x, y) {
    this.addOv(this.add.image(x, y, uiPanelKey(this, 92, 28, 14)).setScale(HD));
    this.addOv(this.add.image(x - 30, y, 'coin').setScale(HD * 0.9));
    this.coinLabel = this.addOv(this.text(x - 16, y, String(Save.data.wallet), 15, '#ffd86a', [0, 0.5], null));
  }

  // the alien on a floating rock, with glow. Returns the sprite.
  hero(cx, feetY, scale, skin) {
    ensureSkin(this, skin);
    const plat = this.addOv(this.add.image(cx, feetY, platformKey(this, 0, 150)).setOrigin(0.5, PLAT_TOP / PLAT_H).setScale(HD));
    const aura = this.addOv(this.add.image(cx, feetY - 22 * scale, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tintOf(skin)).setScale(HD * scale * 2.6).setAlpha(0.35));
    const al = this.addOv(this.add.image(cx, feetY, alienKey(skin, 'idle')).setOrigin(0.5, 1).setScale(scale));
    this.tweens.add({ targets: [al], y: feetY - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: aura, alpha: { from: 0.25, to: 0.5 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return al;
  }

  // ------------------------------------------------------------------ home
  showHome() {
    this.panel(0, 0, H / 2, 0);
    this.view = 'home';
    const best = Save.data.best;

    // top bar
    this.addOv(this.add.image(66, 40, uiPanelKey(this, 112, 28, 14)).setScale(HD));
    this.ovText(66, 40, best > 0 ? `BEST  ${best} m` : 'NO RUNS YET', 12, '#cfc8ff', 500);
    this.coinPill(W - 62, 40);

    // logo + tagline
    this.addOv(this.add.image(W / 2, 136, 'logo').setScale(HD));
    this.ovText(W / 2, 206, 'TAP. JUMP. GO FURTHER.', 13, '#cfc8ff', 500);

    this.hero(W / 2, 392, 3, Save.data.equipped);

    this.button('Play', W / 2, 478, 250, 64, 'green', () => this.startGame());

    const row = [
      ['ic_settings', 'Settings', () => this.showSettings()],
      ['ic_ranks', 'Ranks', () => this.toast('Global ranks are coming soon')],
      ['ic_wardrobe', 'Wardrobe', () => this.showWardrobe()],
      ['ic_shop', 'Shop', () => this.toast('The shop is coming soon')],
    ];
    row.forEach(([ic, label, cb], i) => this.iconButton(ic, 54 + i * 84, 556, 60, cb, label));
    this.ovText(W / 2, 626, 'prototype build', 10, '#7d73b8', 500);
  }

  // ------------------------------------------------------------------ settings
  showSettings() {
    const st = Save.data.settings;
    const cardH = 300;
    const top = H / 2 - cardH / 2;
    this.panel(290, cardH);
    this.view = 'settings';
    this.ovText(W / 2, top + 38, 'SETTINGS', 24, '#ffffff');
    this.button(`Sound: ${st.sound ? 'On' : 'Off'}`, W / 2, top + 104, 230, 48, 'ghost', () => {
      st.sound = !st.sound;
      Save.flush();
      this.showSettings();
    });
    this.button(`Haptics: ${st.haptics ? 'On' : 'Off'}`, W / 2, top + 166, 230, 48, 'ghost', () => {
      st.haptics = !st.haptics;
      Save.flush();
      this.showSettings();
    });
    this.button('Close', W / 2, top + 244, 230, 48, 'green', () => this.showHome());
  }

  // ------------------------------------------------------------------ wardrobe
  showWardrobe() {
    this.panel(0, 0, H / 2, 0);
    this.view = 'wardrobe';
    const sel = skinById(this.selected) || SKIN_CATALOG[0];
    const owned = Save.owns(sel.id);
    const equipped = Save.data.equipped === sel.id;
    const wallet = Save.data.wallet;
    ensureSkin(this, sel.id);

    // header
    this.iconButton('ic_back', 32, 40, 54, () => this.showHome());
    this.ovText(W / 2 - 4, 40, 'WARDROBE', 22, '#ffffff');
    this.coinPill(W - 56, 40);

    // stage
    this.hero(W / 2, 252, 3, sel.id);
    this.ovText(W / 2, 306, sel.name, 26, '#ffffff');
    let sub = '';
    let subColor = '#b9aef5';
    if (equipped) { sub = 'Equipped'; subColor = '#7dffb0'; }
    else if (owned) sub = 'Owned';
    else if (wallet < sel.price.coins) { sub = `${sel.price.coins - wallet} more coins to unlock`; subColor = '#ffd86a'; }
    else sub = 'Ready to unlock';
    this.ovText(W / 2, 332, sub, 13, subColor, 500);

    // action button
    const by = 378;
    if (equipped) {
      this.button('Equipped', W / 2, by, 230, 52, 'ghost', () => {});
    } else if (owned) {
      this.button('Equip', W / 2, by, 230, 52, 'green', () => {
        Save.equip(sel.id);
        sfx.revive();
        this.showWardrobe();
      });
    } else {
      // locked: two ways in. Coins (earned) on the left, the store price (real money) on the right.
      const afford = wallet >= sel.price.coins;
      const L = this.button(afford ? `Buy  ${sel.price.coins}` : `${sel.price.coins}`, 124, by, 164, 52, afford ? 'amber' : 'ghost', () =>
        afford ? this.buy(sel.id) : this.toast(`Collect ${sel.price.coins - wallet} more coins`)
      );
      this.addOv(this.add.image(124 + L.t.width / 2 + 16, by - 1, 'coin').setScale(HD * 0.95));
      this.button(formatMYR(sel.priceMYR), 266, by, 104, 52, 'blue', () => this.buyWithMoney(sel));
    }

    // skin grid: 4 + 3
    const cw = 76, ch = 96, gap = 10;
    const rows = [SKIN_CATALOG.slice(0, 4), SKIN_CATALOG.slice(4)];
    rows.forEach((row, ri) => {
      const total = row.length * cw + (row.length - 1) * gap;
      row.forEach((sk, ci) => {
        const cx = (W - total) / 2 + cw / 2 + ci * (cw + gap);
        const cy = 464 + ri * (ch + 12);
        const isSel = sk.id === sel.id;
        const card = this.addOv(this.add.image(cx, cy, uiCardKey(this, cw, ch, isSel ? 'selected' : 'idle')).setScale(HD));
        ensureSkin(this, sk.id);
        const own = Save.owns(sk.id);
        const al = this.addOv(this.add.image(cx, cy + 20, alienKey(sk.id, 'idle')).setOrigin(0.5, 1).setScale(1.5));
        if (!own) al.setAlpha(0.8);
        if (Save.data.equipped === sk.id) {
          this.addOv(this.add.image(cx - 15, cy + 36, 'ic_check').setScale(HD * 0.7));
          this.ovText(cx + 5, cy + 36, 'On', 11, '#7dffb0', 700);
        } else if (own) {
          this.ovText(cx, cy + 36, 'Owned', 11, '#b9aef5', 500);
        } else {
          const txt = String(sk.price.coins);
          const wide = txt.length >= 4;
          this.addOv(this.add.image(cx - (wide ? 21 : 17), cy + 36, 'coin').setScale(HD * 0.6));
          this.ovText(cx + (wide ? 6 : 4), cy + 36, txt, wide ? 11 : 12, '#ffd86a', 700);
          this.addOv(this.add.image(cx + cw / 2 - 12, cy - ch / 2 + 12, 'ic_lock').setScale(HD * 0.8));
        }
        this.hit(cx, cy, cw, ch, () => {
          this.selected = sk.id;
          this.showWardrobe();
        }, card);
      });
    });
  }

  buy(id) {
    const r = Save.buySkin(id);
    if (r.ok) {
      Save.equip(id);
      sfx.revive();
      this.cameras.main.flash(180, 255, 236, 160, true);
      this.showWardrobe();
    } else if (r.reason === 'funds') {
      this.toast('Not enough coins yet');
    } else {
      this.showWardrobe();
    }
  }

  // Real-money purchase through StoreService. Prototype: a clearly marked test sheet instead of Google Play Billing.
  async buyWithMoney(sel) {
    StoreService.mock.outcome = () => this.showTestPurchase(sel);
    this.hideOverlay();
    const res = await StoreService.purchase(sel.iapSku);
    if (res.ok) {
      Save.grantSkin(sel.id, res.txId);
      Save.equip(sel.id);
      sfx.revive();
      this.cameras.main.flash(180, 255, 236, 160, true);
    } else {
      this.toast(res.reason === 'cancelled' ? 'Purchase cancelled' : 'Purchase failed. You were not charged');
    }
    this.showWardrobe();
  }

  showTestPurchase(sel) {
    return new Promise((resolve) => {
      const cardH = 330;
      const top = H / 2 - cardH / 2;
      this.panel(300, cardH);
      this.ovText(W / 2, top + 38, 'TEST PURCHASE', 22, '#ffd86a');
      this.ovText(W / 2, top + 68, 'simulated store sheet. no money is charged', 12, '#b9aef5', 500);
      this.ovText(W / 2, top + 108, `${sel.name} skin`, 20, '#ffffff');
      this.ovText(W / 2, top + 136, formatMYR(sel.priceMYR), 18, '#7dffb0');
      const done = (r) => () => resolve(r);
      this.button('Confirm  (test)', W / 2, top + 196, 250, 52, 'green', done('complete'));
      this.button('Cancel', W / 2, top + 258, 250, 46, 'ghost', done('cancel'));
    });
  }
}
