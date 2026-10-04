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
import { Online, flagOf } from '../services/online.js';
import { openJoin, showRecoveryCode } from '../ui/join.js';

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
      ['ic_ranks', 'Ranks', () => this.showRanks()],
      ['ic_wardrobe', 'Wardrobe', () => this.showWardrobe()],
      ['ic_shop', 'Shop', () => this.toast('The shop is coming soon')],
    ];
    row.forEach(([ic, label, cb], i) => this.iconButton(ic, 54 + i * 84, 556, 60, cb, label));
    this.ovText(W / 2, 626, 'prototype build', 10, '#7d73b8', 500);
  }

  // ------------------------------------------------------------------ settings
  showSettings() {
    const st = Save.data.settings;
    const prof = Online.profile;
    const cardH = prof ? 362 : 300;
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
    if (prof) {
      this.button('Recovery code', W / 2, top + 228, 230, 48, 'ghost', () => showRecoveryCode({ profile: prof, onDone: () => {} }));
      this.ovText(W / 2, top + 262, `${flagOf(prof.country)}  ${prof.nickname}`, 12, '#9d92d8', 500);
    }
    this.button('Close', W / 2, top + cardH - 56, 230, 48, 'green', () => this.showHome());
  }

  // ------------------------------------------------------------------ ranks (global, all time)
  showRanks(page = 0) {
    this.panel(0, 0, H / 2, 0);
    this.view = 'ranks';
    this.rankPage = page;
    const PAGE = 10;
    this.iconButton('ic_back', 32, 40, 54, () => this.showHome());
    this.ovText(W / 2 - 4, 40, 'RANKS', 22, '#ffffff');
    this.ovText(W / 2, 74, Online.isMock ? 'Global  ·  all time  ·  TEST BOARD' : 'Global  ·  all time', 12, '#b9aef5', 500);
    const loading = this.ovText(W / 2, 250, 'Loading...', 16, '#b9aef5', 500);
    const token = (this.ranksToken = (this.ranksToken || 0) + 1);
    Online.board(PAGE, page * PAGE).then((r) => {
      if (this.view !== 'ranks' || token !== this.ranksToken) return; // the player moved on
      loading.destroy();
      if (!r.ok) {
        this.ovText(W / 2, 230, "Can't reach the leaderboard", 16, '#ffb3c1', 500);
        this.ovText(W / 2, 256, 'Check your internet connection', 12, '#9d92d8', 500);
        this.button('Try again', W / 2, 310, 200, 46, 'blue', () => this.showRanks(page));
        return;
      }
      const me = r.me;
      r.entries.forEach((e, i) => {
        const y = 106 + i * 33;
        const mine = Online.profile && e.nickname === Online.profile.nickname;
        if (mine) this.addOv(this.add.image(W / 2, y, uiPanelKey(this, 326, 30, 12)).setScale(HD));
        const col = e.rank === 1 ? '#ffd86a' : e.rank === 2 ? '#dfe6f5' : e.rank === 3 ? '#ffb27a' : '#b9aef5';
        this.ovText(34, y, String(e.rank), 14, col, 700);
        this.ovText(60, y, flagOf(e.country), 16, '#ffffff', 500);
        const nm = this.ovText(84, y, e.nickname, 15, mine ? '#7dffb0' : '#ffffff', 600);
        nm.setOrigin(0, 0.5);
        const ht = this.ovText(W - 24, y, `${e.heightM} m`, 14, '#ffd86a', 700);
        ht.setOrigin(1, 0.5);
      });
      if (!r.entries.length) this.ovText(W / 2, 250, 'No one is ranked yet. Be the first!', 14, '#b9aef5', 500);
      // paging
      const pages = Math.max(1, Math.ceil((r.total ?? (page + 1) * PAGE + (r.entries.length === PAGE ? 1 : 0)) / PAGE));
      const py = 454;
      if (page > 0) this.button('Prev', 70, py, 100, 38, 'ghost', () => this.showRanks(page - 1));
      this.ovText(W / 2, py, `${page + 1}`, 14, '#b9aef5', 600);
      if (r.entries.length === PAGE && page + 1 < pages) this.button('Next', W - 70, py, 100, 38, 'ghost', () => this.showRanks(page + 1));
      // my row, pinned
      if (me && me.rank) {
        this.addOv(this.add.image(W / 2, 506, uiPanelKey(this, 326, 40, 14)).setScale(HD));
        this.ovText(34, 506, `#${me.rank}`, 14, '#7dffb0', 700);
        this.ovText(70, 506, flagOf(me.country), 16, '#ffffff', 500);
        this.ovText(94, 506, me.nickname, 15, '#7dffb0', 600).setOrigin(0, 0.5);
        this.ovText(W - 24, 506, `${me.heightM} m`, 14, '#ffd86a', 700).setOrigin(1, 0.5);
      } else if (me) {
        this.ovText(W / 2, 506, `${flagOf(me.country)}  ${me.nickname}: finish a ranked run to get on the board`, 12, '#b9aef5', 500);
      }
    });
    if (!Online.profile) {
      this.button('Join the ranks', W / 2, 566, 250, 54, 'green', () => this.joinFlow());
      this.ovText(W / 2, 604, 'Choose a nickname and country to compete', 11, '#9d92d8', 500);
    }
  }

  joinFlow() {
    openJoin({ onDone: () => this.showRanks(), onCancel: () => {} });
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
