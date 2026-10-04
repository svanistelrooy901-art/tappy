import Phaser from 'phaser';
import { UIScene, HD, OFFX, OFFY } from './UIScene.js';
import { SpaceBackground } from '../background.js';
import { SKINS, ensureSkin, alienKey } from '../art.js';
import { CFG } from '../config.js';
import { heightMOf } from '../core/gen.js';
import { S } from '../core/player.js';
import { RunSim } from '../core/runsim.js';
import { GravityWell } from '../core/gravity.js';
import { zoneOf } from '../core/physics.js';
import { PLAT_H, PLAT_TOP, platformKey, uiPanelKey } from '../art_hd.js';
import { Save } from '../services/save.js';
import { AdService } from '../services/ad.js';
import { sfx, unlockAudio, vibrate } from '../services/sfx.js';

const { W, H, Z } = CFG;
const PL = CFG.player;
const STEP = CFG.physics.step;
const DEBUG = new URLSearchParams(location.search).has('debug');
const smooth01 = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const grey = (g) => {
  const v = Math.round(255 * Math.min(1, Math.max(0, g)));
  return (v << 16) | (v << 8) | v;
};
const fmtMult = (m) => `${Number.isInteger(m) ? m : m.toFixed(1)}x`;

export class GameScene extends UIScene {
  constructor() {
    super('Game');
  }

  create() {
    this.initUI();
    this.pSprite = null;
    this.aura = null;
    this.skin = Save.data.equipped;
    ensureSkin(this, this.skin);
    this.space = new SpaceBackground(this, this.bgLayer, this.fgLayer);
    this.buildHud();
    // Black Zone lantern: a soft pool of light around the alien (taller upward), under the world objects
    this.lantern = this.add.image(0, 0, 'lantern').setBlendMode(Phaser.BlendModes.ADD).setDepth(9).setVisible(false);
    this.buildPhantom();
    this.lastTapAt = 0;
    this.trailT = 0;
    this.shotSprites = new Map();
    this.phase = 'PLAY';

    this.input.on('pointerdown', this.onPointer, this);
    this.input.keyboard?.on('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a') this.tryJump(-1);
      else if (k === 'ArrowRight' || k === 'd') this.tryJump(1);
      else if (k === 'ArrowUp' || k === ' ' || k === 'w' || k === 's') this.tryJump(0);
      else if (k === 'p' || k === 'Escape') this.phase === 'PLAY' ? this.pause() : this.phase === 'PAUSED' && this.resume();
    });
    const onHidden = () => this.phase === 'PLAY' && this.pause();
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.events.once('shutdown', () => this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden));
    this.cameras.main.fadeIn(220, 10, 6, 32);

    const seedParam = new URLSearchParams(location.search).get('seed');
    this.startRun(seedParam ? Number(seedParam) : undefined);

    window.__tappy = { scene: this, ad: AdService };
  }

  // the run itself lives in RunSim (pure, shared with the server's replay check); the scene only draws it
  get camTop() { return this.sim ? this.sim.camTop : 0; }
  get simT() { return this.sim ? this.sim.simT : 0; }

  applyCam() {
    this.cameras.main.setScroll(-OFFX, this.camTop - OFFY);
  }

  // ------------------------------------------------------------------ setup
  buildHud() {
    const L = this.hudLayer;
    const top = CFG.hudTop;
    L.add(this.add.image(0, 0, 'scrim_top').setOrigin(0).setScale(HD));

    this.hearts = [];
    for (let i = 0; i < CFG.lives; i++) {
      const h = this.add.image(24 + i * 27, top + 17, 'heart_full').setScale(HD);
      L.add(h);
      this.hearts.push(h);
    }
    this.prevLives = CFG.lives;

    this.heightText = this.text(W / 2, top + 16, '0', 36, '#ffffff');
    this.text(W / 2, top + 42, 'METRES', 10, '#b9aef5', [0.5, 0.5], L, 500).setAlpha(0.8);

    L.add(this.add.image(46, top + 56, uiPanelKey(this, 74, 26, 13)).setScale(HD));
    L.add(this.add.image(24, top + 56, 'coin').setScale(HD * 0.9));
    this.coinText = this.text(38, top + 56, '0', 15, '#ffd86a', [0, 0.5]);
    // Red / Black Zone: coins pay extra. A small tag beside the coin counter keeps that in mind.
    this.mult = this.add.container(104, top + 56).setVisible(false);
    this.mult.add(this.add.image(0, 0, uiPanelKey(this, 38, 20, 10)).setScale(HD));
    this.multText = this.text(0, 0, '1.5x', 12, '#ff9a8a', [0.5, 0.5], null);
    this.mult.add(this.multText);
    L.add(this.mult);

    this.pauseBtn = this.add.image(W - 27, top + 20, 'ui_pause').setScale(HD);
    L.add(this.pauseBtn);

    // first-run onboarding: three tap zones, fades away after the first jump
    this.hint = [];
    const zy = H - 76;
    const names = ['LEFT', 'JUMP', 'RIGHT'];
    const arrows = ['arrow_l', 'arrow_u', 'arrow_r'];
    for (let i = 0; i < 3; i++) {
      const cx = (W / 3) * i + W / 6;
      const zone = this.add.image(cx, zy, 'hint_zone').setScale(HD);
      const ar = this.add.image(cx, zy - 14, arrows[i]).setScale(HD);
      const lb = this.text(cx, zy + 26, names[i], 12, '#cfc8ff', [0.5, 0.5], null, 500).setAlpha(0.85);
      this.hint.push(zone, ar, lb);
      L.add([zone, ar, lb]);
      this.tweens.add({ targets: ar, alpha: { from: 0.45, to: 1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: i * 140 });
    }
    const msg = this.text(W / 2, H - 16, 'Tap to jump. Tap again in the air!', 13, '#d9d2ff', [0.5, 0.5], L, 500);
    this.hint.push(msg);

    if (DEBUG) {
      this.dbg = this.text(6, H - 6, '', 10, '#7CFFB2', [0, 1], L);
      const g = this.add.graphics();
      g.lineStyle(1, 0x7cffb2, 0.5);
      for (const f of CFG.input.zones) g.lineBetween(W * f, 0, W * f, H);
      L.add(g);
    }
  }

  hideHint() {
    if (!this.hint) return;
    const h = this.hint;
    this.hint = null;
    this.tweens.add({ targets: h, alpha: 0, duration: 450, onComplete: () => h.forEach((o) => o.destroy()) });
  }

  // ------------------------------------------------------------------ run lifecycle
  // Phantom Zone extras: arrows that sweep toward the hole, and a faint gravity line from the hole to the alien
  buildPhantom() {
    this.chevs = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3; i++) {
        const c = this.add.image(0, 0, 'chev').setScale(HD).setAlpha(0).setVisible(false);
        this.hudLayer.add(c);
        this.chevs.push({ img: c, row: r, i });
      }
    }
    this.rope = [];
    for (let i = 0; i < 8; i++) {
      const d = this.add.image(0, 0, 'dot').setBlendMode(Phaser.BlendModes.ADD).setTint(0xb9a0ff).setAlpha(0).setVisible(false);
      this.fgLayer.add(d);
      this.rope.push(d);
    }
    this.holeI = 0; // smoothed 0..1 "how awake the hole is", drives its size and brightness
    this.holeX = 180;
  }

  startRun(seed) {
    for (const arr of [this.platforms, this.hazards, this.coins, this.fx]) arr?.forEach((o) => this.killObj(o));
    this.shotSprites?.forEach((sp) => sp.destroy());
    this.shotSprites?.clear();
    this.bannerObjs?.forEach((o) => o.destroy());
    this.bannerObjs = null;
    this.hideOverlay();
    AdService.warmUp(); // have the next rewarded ad loaded before the player could ever need it
    this.fx = [];
    this.acc = 0;
    this.sim = null;
    this.applyCam();

    const s = seed ?? Math.floor(Math.random() * 2 ** 31);
    this.sim = new RunSim(s, this.simHooks());
    this.run = this.sim.run;
    this.gen = this.sim.gen;
    this.gravity = this.sim.gravity;
    this.body = this.sim.body;
    this.platforms = this.sim.platforms;
    this.hazards = this.sim.hazards;
    this.coins = this.sim.coins;
    this.shooters = this.sim.shooters;
    this.pullHintShown = false;
    this.holeX = this.gravity.side < 0 ? 58 : 302;
    this.holeI = 0;
    this.sq = { x: 1, y: 1 };
    this.prevLives = CFG.lives;

    if (!this.pSprite) {
      this.aura = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(parseInt(SKINS[this.skin].body.slice(1), 16)).setDepth(28);
      this.pSprite = this.add.image(0, 0, alienKey(this.skin, 'idle')).setOrigin(0.5, 1).setDepth(30);
    }

    // the sim already built the first rows before the scene could attach sprites: dress them now
    for (const p of this.platforms) this.dressPlatform(p);
    for (const h of this.hazards) this.dressHazard(h);
    for (const c of this.coins) this.dressCoin(c);
    this.phase = 'PLAY';
    this.updateHud();
    this.syncSprite(0);
  }

  // What the scene does when the simulation reports something (sound, particles, banners). Nothing here decides play.
  simHooks() {
    return {
      onRow: (row) => {
        if (this.sim) this.dressRow(row); // rows made after start; the first ones are dressed in startRun
      },
      onRemove: (o) => this.killObj(o),
      onJump: (d, g) => this.onJump(d, g),
      onLand: (p, v) => this.onLand(p, v),
      onBadTransition: (a, b) => console.warn('[player] rejected transition', a, '->', b),
      onRespawn: () => { this.sq = { x: 1, y: 1 }; },
      onLoseLife: (cause, lives) => {
        vibrate(40);
        this.cameras.main.shake(160, 0.012);
        this.updateHud();
        if (lives > 0) sfx.hit();
        else sfx.die();
      },
      onEnd: () => {
        this.phase = 'OVER';
        this.showGameOver();
      },
      onSpitWarn: (h, camTop) => { if (h.y > camTop - 10) sfx.spitWarn(); },
      onSpitFire: (shot, h, camTop) => {
        this.shotSprites.set(shot, this.add.image(shot.x, shot.y, 'orb').setScale(HD).setDepth(22));
        if (h.y > camTop - 10) sfx.spit();
      },
      onShotGone: (shot) => this.dropShot(shot),
      onShotHit: (shot) => {
        this.puff(shot.x, shot.y, 8, 0xff6a3a, true, 1.3);
        this.dropShot(shot);
      },
      onPullPhase: (ph) => this.onPullPhase(ph),
      onHeight: (before) => {
        if (Math.floor(this.run.maxHeightM) !== before) this.heightText.setText(String(Math.floor(this.run.maxHeightM)));
        if (this.run.inRedZone && !this.run.redZoneShown) this.showRedZone();
        if (this.run.inBlackZone && !this.run.blackZoneShown) this.showBlackZone();
        if (this.run.inPhantomZone && !this.run.phantomZoneShown) this.showPhantomZone();
        else if (this.run.phantomLevel > this.run.phantomLevelShown) this.showHoleStronger();
      },
      onCoin: (c) => {
        this.coinText.setText(String(this.run.coins));
        sfx.coin();
        this.puff(c.x, c.y, 6, 0xffd23f, true, 1.2);
        c.sprite?.destroy();
      },
    };
  }

  later(sec, cb) {
    this.sim.later(sec, cb);
  }

  // ------------------------------------------------------------------ world objects
  killObj(o) {
    o.sprite?.destroy();
    o.lane?.destroy();
    o.rim?.destroy();
    o.edge?.destroy();
  }

  dressRow(row) {
    for (const p of row.platforms) this.dressPlatform(p);
    for (const h of row.hazards) this.dressHazard(h);
    for (const c of row.coins) this.dressCoin(c);
  }

  dressPlatform(p) {
    const BZ = CFG.blackZone;
    const key = platformKey(this, p.theme, p.w);
    p.sprite = this.add.image(p.x, p.y, key).setOrigin(0.5, PLAT_TOP / PLAT_H).setScale(HD).setDepth(10);
    // Black Zone: a thin light along the top of every ledge (hidden until the lights go out)
    p.edge = this.add.image(p.x, p.y + 0.5, 'edge').setBlendMode(Phaser.BlendModes.ADD).setDepth(11).setTint(BZ.edge[p.theme % 3]).setDisplaySize(p.w, 8).setVisible(false);
  }

  dressHazard(h) {
    const BZ = CFG.blackZone;
    h.sprite = this.add.image(h.x, h.y, CFG.hazards[h.kind].tex).setScale(HD).setDepth(20);
    // Black Zone: glowing outline at the hazard's true hit radius (hidden until the lights go out)
    h.rim = this.add.image(h.x, h.y, 'rim').setBlendMode(Phaser.BlendModes.ADD).setDepth(21).setTint(BZ.rim[h.kind]).setScale((HD * (h.r + 1.5)) / 20).setVisible(false);
    if (h.shooter) {
      h.sprite.setFlipX(h.dir < 0);
      // dotted lane shown while the Spitter charges, running from the cannon across the screen
      h.lane = this.add.image(h.x, h.y, 'lane').setScale(HD).setOrigin(h.dir > 0 ? 0 : 1, 0.5).setFlipX(h.dir < 0).setAlpha(0).setDepth(12);
    }
  }

  dressCoin(c) {
    c.sprite = this.add.image(c.x, c.y, 'coin').setScale(HD).setDepth(15);
    c.t0 = Math.random() * 6; // wobble phase, purely visual
  }

  // ------------------------------------------------------------------ input
  onPointer(pointer) {
    if (this.handleButtons(pointer)) return;
    const px = pointer.x / Z;
    const py = pointer.y / Z;
    if (this.phase !== 'PLAY') return;
    if (px > W - 54 && py < CFG.hudTop + 46) return this.pause();
    // ignore duplicate touch/mouse events fired for the same tap
    const now = performance.now();
    if (now - this.lastTapAt < 30) return;
    this.lastTapAt = now;
    this.tryJump(zoneOf(pointer.x / this.scale.gameSize.width));
  }

  tryJump(dir) {
    if (this.phase !== 'PLAY') return;
    this.sim.tap(dir);
  }

  // ------------------------------------------------------------------ player events
  onJump(dir, fromGround) {
    sfx.jump();
    vibrate(8);
    this.sq = { x: 0.78, y: 1.3 };
    if (fromGround) this.puff(this.body.x, this.body.y + PL.feet, 6, 0xdff1ff, false);
    else this.puff(this.body.x, this.body.y + PL.feet - 4, 4, 0x9fb3ff, true);
    this.hideHint();
  }

  onLand(p, impact) {
    if (impact > 160) {
      sfx.land();
      this.sq = { x: 1.3, y: 0.72 };
      this.puff(this.body.x, p.y, 5, 0xdff1ff, false);
    }
  }

  // soft glowing puffs (replaces the old square pixels)
  puff(x, y, n, color, additive = true, big = 1) {
    for (let i = 0; i < n; i++) {
      const s = (0.5 + Math.random() * 0.8) * big;
      const d = this.add.image(x + (Math.random() - 0.5) * 12, y, 'dot').setTint(color).setDepth(26).setScale(HD * s).setAlpha(0.85);
      if (additive) d.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: d,
        x: d.x + (Math.random() - 0.5) * 40,
        y: d.y - 4 - Math.random() * 18,
        alpha: 0,
        scale: HD * s * 0.3,
        duration: 340 + Math.random() * 200,
        onComplete: () => d.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ life / death
  // (lives, hits, falls, the end of the run and revives are decided in RunSim; see simHooks for the reactions)

  commitRun() {
    return Save.commitRun(this.run);
  }

  async tryRevive() {
    // Normal rewarded revive. Granted ONLY after the ad service confirms the reward.
    this.hideOverlay();
    this.phase = 'AD';
    AdService.mock.outcome = () => this.showMockAd();
    // slow network: the ad may not be loaded yet. Show a "loading" card (with Cancel) instead of a frozen screen.
    let cancelled = false;
    if (!AdService.isReady()) this.showAdLoading(() => { cancelled = true; });
    const res = await AdService.showRewarded({ isCancelled: () => cancelled, onShow: () => this.hideOverlay() });
    if (cancelled) { this.phase = 'OVER'; this.showGameOver(); return; }
    this.hideOverlay();
    if (res.rewarded && this.run.canNormalRevive) {
      this.sim.revive('ad');
      sfx.revive();
      this.phase = 'PLAY';
      this.updateHud();
    } else {
      this.phase = 'OVER';
      this.showGameOver(res.reason === 'fail' || res.reason === 'timeout' ? 'Ad not available. No penalty.' : 'No reward. No penalty.');
    }
  }

  // Second revive: coins, once per run, after the ad revive. Confirmed first, charged only when granted.
  tryCoinRevive() {
    const cost = CFG.coinRevive.cost;
    const res = Save.spendOnRevive(this.run, cost);
    if (!res.ok) {
      this.showGameOver('Not enough coins');
      return;
    }
    this.hideOverlay();
    this.sim.revive('coin');
    sfx.revive();
    this.phase = 'PLAY';
    this.updateHud();
  }

  confirmCoinRevive() {
    const cost = CFG.coinRevive.cost;
    const cardH = 300;
    const top = H / 2 - cardH / 2;
    this.panel(300, cardH);
    this.ovText(W / 2, top + 40, 'CONTINUE?', 24, '#ffffff');
    this.ovText(W / 2, top + 84, 'Spend', 14, '#b9aef5', 500);
    const amt = this.ovText(W / 2 + 12, top + 118, String(cost), 30, '#ffd86a');
    this.addOv(this.add.image(W / 2 + 12 - amt.width / 2 - 18, top + 118, 'coin').setScale(HD * 1.2));
    this.ovText(W / 2, top + 156, 'coins for one more life', 13, '#b9aef5', 500);
    this.button('Revive', W / 2, top + 208, 244, 52, 'amber', () => this.tryCoinRevive());
    this.button('Back', W / 2, top + 264, 244, 40, 'ghost', () => this.showGameOver());
  }

  // ------------------------------------------------------------------ overlays
  showGameOver(note) {
    const run = this.run;
    const m = Math.floor(run.maxHeightM);
    const newBest = m > Save.data.best;
    const canRevive = run.canNormalRevive;
    const coinCost = CFG.coinRevive.cost;
    const canCoinRevive = run.canCoinRevive && Save.data.wallet + run.coins >= coinCost;
    const offer = canRevive || canCoinRevive;
    const cardH = offer ? 452 : 382;
    const top = H / 2 - cardH / 2;
    this.panel(300, cardH);
    this.ovText(W / 2, top + 36, 'GAME OVER', 24, '#ff8fae');
    this.ovText(W / 2, top + 98, `${m}`, 66, '#ffffff');
    this.ovText(W / 2, top + 140, 'METRES', 11, '#b9aef5', 500);
    this.ovText(W / 2, top + 170, newBest ? 'NEW BEST!' : `Best  ${Save.data.best} m`, newBest ? 18 : 15, newBest ? '#ffd86a' : '#b9aef5');
    const earned = this.ovText(W / 2 + 12, top + 202, `+${run.coins}`, 18, '#ffd86a');
    this.addOv(this.add.image(W / 2 + 12 - earned.width / 2 - 16, top + 202, 'coin').setScale(HD));

    let y = top + 258;
    if (canRevive) {
      this.button('Revive  (watch ad)', W / 2, y, 244, 54, 'blue', () => this.tryRevive());
      this.ovText(W / 2, y + 38, 'optional. restarting is always free', 11, '#9d92d8', 500);
      y += 82;
    } else if (canCoinRevive) {
      const b = this.button(`Revive  ${coinCost}`, W / 2, y, 244, 54, 'amber', () => this.confirmCoinRevive());
      this.addOv(this.add.image(W / 2 + b.t.width / 2 + 16, y - 1, 'coin').setScale(HD));
      this.ovText(W / 2, y + 38, 'optional. uses coins. restarting is free', 11, '#9d92d8', 500);
      y += 82;
    } else {
      this.commitRun();
    }
    this.button('Play again', W / 2, y, 244, 58, 'green', () => {
      this.commitRun();
      this.startRun();
    });
    this.button('Menu', W / 2, y + 62, 244, 42, 'ghost', () => this.toMenu());
    if (note) this.ovText(W / 2, y + 100, note, 12, '#ffb3c1', 500);
  }

  toMenu() {
    this.commitRun();
    this.phase = 'LEAVING';
    this.cameras.main.fadeOut(160, 10, 6, 32);
    this.time.delayedCall(170, () => this.scene.start('Menu'));
  }

  pause() {
    if (this.phase !== 'PLAY') return;
    this.phase = 'PAUSED';
    this.showPause();
  }
  resume() {
    this.hideOverlay();
    this.ovLayer.setAlpha(1);
    this.phase = 'PLAY';
  }
  showPause() {
    const st = Save.data.settings;
    const cardH = 350;
    const top = H / 2 - cardH / 2;
    this.panel(290, cardH);
    this.ovText(W / 2, top + 38, 'PAUSED', 26, '#ffffff');
    this.button('Resume', W / 2, top + 100, 230, 54, 'green', () => this.resume());
    this.button(`Sound: ${st.sound ? 'On' : 'Off'}`, W / 2, top + 168, 230, 46, 'ghost', () => {
      st.sound = !st.sound;
      Save.flush();
      this.showPause();
    });
    this.button(`Haptics: ${st.haptics ? 'On' : 'Off'}`, W / 2, top + 224, 230, 46, 'ghost', () => {
      st.haptics = !st.haptics;
      Save.flush();
      this.showPause();
    });
    this.button('Quit to menu', W / 2, top + 296, 230, 46, 'pink', () => this.toMenu());
  }

  // shown while a rewarded ad is still loading (slow connection): animated, honest, and cancellable
  showAdLoading(onCancel) {
    const cardH = 250;
    const top = H / 2 - cardH / 2;
    this.panel(300, cardH);
    this.ovText(W / 2, top + 44, 'LOADING AD', 22, '#ffffff');
    const dots = this.ovText(W / 2, top + 92, '. . .', 30, '#ffd86a');
    const slow = this.ovText(W / 2, top + 136, '', 12, '#b9aef5', 500);
    let n = 0;
    const tick = this.time.addEvent({
      delay: 350, loop: true,
      callback: () => { n++; dots.setText('. '.repeat((n % 3) + 1).trim()); if (n === 8) slow.setText('Slow connection. Hang on a moment...'); },
    });
    this.overlayCleanup = () => tick.remove();
    this.button('Cancel', W / 2, top + 196, 200, 44, 'ghost', () => { tick.remove(); onCancel(); });
  }

  // QA-friendly stand-in for a real rewarded ad: every outcome path is testable.
  showMockAd() {
    return new Promise((resolve) => {
      const cardH = 340;
      const top = H / 2 - cardH / 2;
      this.panel(300, cardH);
      this.ovText(W / 2, top + 38, 'TEST AD', 24, '#ffd86a');
      this.ovText(W / 2, top + 70, 'simulated rewarded ad', 13, '#b9aef5', 500);
      const done = (r) => () => resolve(r);
      this.button('Finish ad  (reward)', W / 2, top + 130, 250, 52, 'green', done('complete'));
      this.button('Close early  (no reward)', W / 2, top + 196, 250, 52, 'amber', done('close'));
      this.button('Ad fails to load', W / 2, top + 262, 250, 52, 'pink', done('fail'));
    });
  }

  // ------------------------------------------------------------------ red zone + spitters
  dropShot(shot) {
    const sp = this.shotSprites.get(shot);
    if (sp) {
      sp.destroy();
      this.shotSprites.delete(shot);
    }
  }

  // Zone banner: once per run, never pauses the game
  zoneBanner(o) {
    const L = this.hudLayer;
    const y = H * 0.3;
    o.sfx();
    vibrate(70);
    this.cameras.main.shake(260, 0.006);
    const objs = [];
    if (o.flicker) {
      // lights-out flicker
      const black = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0);
      L.add(black);
      this.tweens.chain({
        targets: black,
        tweens: [
          { alpha: 0.8, duration: 70 },
          { alpha: 0.1, duration: 80 },
          { alpha: 0.85, duration: 70 },
          { alpha: 0, duration: 420 },
        ],
        onComplete: () => black.destroy(),
      });
    } else {
      const flash = this.add.rectangle(W / 2, H / 2, W, H, o.flash, 0.3);
      L.add(flash);
      this.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
    }
    const t1 = this.text(W / 2, y, o.title, o.size ?? 44, o.color, [0.5, 0.5], L, 700).setStroke(o.stroke, 7).setAlpha(0).setScale(1.9);
    const t2 = this.text(W / 2, y + 38, o.sub, 15, '#ffd86a', [0.5, 0.5], L, 700).setAlpha(0);
    objs.push(t1, t2);
    this.bannerObjs = objs;
    this.tweens.add({ targets: t1, alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t1, angle: { from: -2.5, to: 2.5 }, duration: 70, yoyo: true, repeat: 5, delay: 300, onComplete: () => t1.setAngle(0) });
    this.tweens.add({ targets: t2, alpha: 1, duration: 250, delay: 260 });
    this.tweens.add({
      targets: [t1, t2],
      alpha: 0,
      y: '-=26',
      duration: 450,
      delay: 1900,
      onComplete: () => {
        t1.destroy();
        t2.destroy();
        if (this.bannerObjs === objs) this.bannerObjs = null;
      },
    });
    // the multiplier tag next to the coin counter pops in
    this.setMultTag();
    this.mult.setVisible(true).setScale(1.5);
    this.tweens.add({ targets: this.mult, scale: 1, duration: 280, ease: 'Back.easeOut', delay: 300 });
  }

  showRedZone() {
    this.run.redZoneShown = true;
    this.zoneBanner({ title: 'RED ZONE!!!', color: '#ff3a3a', stroke: '#2a0006', sub: `Coins ${fmtMult(CFG.redZone.coinMult)} here`, flash: 0xff1a1a, sfx: sfx.redZone });
  }

  showBlackZone() {
    this.run.blackZoneShown = true;
    this.zoneBanner({ title: 'BLACK ZONE!!!', size: 40, color: '#ece8ff', stroke: '#1b0f55', sub: `Coins ${fmtMult(CFG.blackZone.coinMult)} here`, flicker: true, sfx: sfx.blackZone });
  }

  showPhantomZone() {
    this.run.phantomZoneShown = true;
    this.zoneBanner({ title: 'PHANTOM ZONE!!!', size: 36, color: '#d8c8ff', stroke: '#1a0a4a', sub: `Coins ${fmtMult(CFG.phantomZone.coinMult)} here`, flash: 0x7a4cff, sfx: sfx.phantomZone });
  }

  // every levelM metres deeper: a warning that the black hole (and its pull) just got stronger
  showHoleStronger() {
    const lv = this.run.phantomLevel;
    this.run.phantomLevelShown = lv;
    const x = GravityWell.strengthAt(lv), prev = GravityWell.strengthAt(lv - 1);
    if (x === prev) return; // already at the cap: no new warning
    this.zoneBanner({ title: 'HOLE GROWS!!!', size: 36, color: '#d8c8ff', stroke: '#1a0a4a', sub: `Pull ${fmtMult(x)} stronger`, flash: 0x7a4cff, sfx: sfx.phantomZone });
  }

  // "1.5x" in the Red Zone, "2x" in the Black Zone, "3x" in the Phantom Zone
  setMultTag() {
    const black = this.run.inBlackZone;
    this.multText.setText(fmtMult(this.run.coinMult)).setColor(this.run.inPhantomZone ? '#caa8ff' : black ? '#d8ccff' : '#ff9a8a');
  }

  // ------------------------------------------------------------------ HUD
  updateHud() {
    this.mult.setVisible(this.run.coinMult > 1);
    this.setMultTag();
    const lives = this.run.lives;
    this.hearts.forEach((h, i) => h.setTexture(i < lives ? 'heart_full' : 'heart_empty'));
    if (lives < this.prevLives) {
      const h = this.hearts[lives];
      if (h) this.tweens.add({ targets: h, scale: HD * 1.6, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    } else if (lives > this.prevLives) {
      for (let i = this.prevLives; i < lives; i++) this.tweens.add({ targets: this.hearts[i], scale: HD * 1.5, duration: 160, yoyo: true });
    }
    this.prevLives = lives;
    this.coinText.setText(String(this.run.coins));
    this.heightText.setText(String(Math.floor(this.run.maxHeightM)));
  }

  // ------------------------------------------------------------------ fixed-step simulation
  stepSim(dt) {
    this.sim.step(dt);
  }

  // ------------------------------------------------------------------ render
  syncSprite(dtMs) {
    const b = this.body;
    const s = this.pSprite;
    let pose = 'idle';
    if (b.state === S.JUMPING) pose = b.lastDir < 0 ? 'jump_l' : b.lastDir > 0 ? 'jump_r' : 'jump';
    else if (b.state === S.FALLING) pose = 'fall';
    else if (b.state === S.HIT_STUN || b.state === S.DEAD) pose = 'hurt';
    const tex = alienKey(this.skin, pose);
    if (s.texture.key !== tex) s.setTexture(tex);

    const k = 1 - Math.exp(-(dtMs / 1000) * 16);
    this.sq.x += (1 - this.sq.x) * k;
    this.sq.y += (1 - this.sq.y) * k;
    s.setScale(this.sq.x, this.sq.y);
    s.setPosition(b.x, b.y + PL.feet);
    s.setAngle(b.airborne ? (b.vx / CFG.physics.lateralVx) * 9 : b.state === S.DEAD ? this.simT * 500 : 0);
    s.setAlpha(b.invuln > 0 && b.state !== S.DEAD ? (Math.floor(this.simT * 14) % 2 ? 0.35 : 1) : 1);

    // soft aura
    const a = this.aura;
    a.setPosition(b.x, b.y);
    a.setScale(HD * (1.5 + Math.sin(this.simT * 5) * 0.08));
    a.setAlpha(b.state === S.DEAD ? 0 : b.airborne ? 0.4 : 0.26);
  }

  // BLACK ZONE rendering. dk = 0..1 ramp. Bodies dim with distance from the lantern, but the outline never goes
  // away: it is drawn at the real hit radius, so what glows is exactly what hurts. Orbs and coins are never dimmed.
  onPullPhase(phase) {
    if (phase === 'warn') {
      sfx.pullWarn();
      if (!this.pullHintShown) {
        this.pullHintShown = true;
        const t = this.text(W / 2, H * 0.4, 'The black hole pulls! Tap away from it.', 14, '#e4d8ff', [0.5, 0.5], this.hudLayer, 600).setStroke('#1a0a4a', 5).setAlpha(0);
        this.tweens.add({ targets: t, alpha: 1, duration: 250 });
        this.tweens.add({ targets: t, alpha: 0, duration: 400, delay: 2800, onComplete: () => t.destroy() });
      }
    } else if (phase === 'pull') {
      sfx.pullStart();
      vibrate(30);
    }
  }

  // black hole, its rings, the arrows and the gravity line (screen-space; the hole is not part of the world)
  renderPhantom(delta) {
    const sp = this.space, G = this.gravity, now = this.time.now / 1000;
    const pz = sp.pz;
    const on = pz > 0.001;
    sp.hole.setVisible(on);
    sp.holeRings.forEach((r) => r.setVisible(on));
    if (!on) {
      this.chevs.forEach((c) => c.img.setVisible(false));
      this.rope.forEach((d) => d.setVisible(false));
      sp.pullX = 0;
      return;
    }
    const inZone = this.run.inPhantomZone;
    const target = !inZone ? 0 : G.phase === 'warn' ? 0.7 * G.warn : G.phase === 'pull' ? 0.4 + 0.6 * G.k : 0;
    this.holeI += (target - this.holeI) * (1 - Math.exp(-(delta / 1000) * 6));
    const hi = this.holeI;
    const tx = G.side < 0 ? 58 : 302;
    this.holeX += (tx - this.holeX) * (1 - Math.exp(-(delta / 1000) * 1.8));
    const hy = 188 + Math.sin(now * 0.5) * 6;
    sp.hole.setPosition(this.holeX, hy).setScale(HD * (0.82 + 0.34 * hi + 0.1 * Math.min(2, this.run.phantomLevel))).setAlpha(pz * (0.55 + 0.45 * hi));
    sp.holeRings.forEach((r, i) => {
      const u = (now * (0.35 + 0.9 * hi) + i * 0.5) % 1;
      r.setPosition(this.holeX, hy).setScale(HD * (3.1 - 2.0 * u)).setAlpha(pz * (0.12 + 0.55 * hi) * Math.sin(Math.PI * u));
    });
    sp.pullX = inZone ? G.side * G.k * 10 : 0;

    // arrows at the screen edge, sweeping toward the hole while it warns / pulls
    const show = !inZone ? 0 : G.phase === 'warn' ? 0.9 * G.warn : G.phase === 'pull' ? 0.9 * (0.4 + 0.6 * G.k) : 0;
    const speed = G.phase === 'pull' ? 1.6 : 1.0;
    for (const c of this.chevs) {
      const u = (now * speed + c.i / 3 + c.row * 0.17) % 1;
      const x = G.side < 0 ? 128 - 108 * u : 232 + 108 * u;
      c.img.setVisible(show > 0.01).setPosition(x, 320 + c.row * 52).setFlipX(G.side > 0).setAlpha(show * Math.sin(Math.PI * u));
    }
    // a faint gravity line from the alien toward the hole while the pull is active
    const b = this.body;
    const lineA = inZone && G.phase === 'pull' && b.airborne ? 0.4 * G.k : 0;
    const ax = b.x, ay = b.y - this.camTop;
    this.rope.forEach((d, i) => {
      const t = (i + (now * 2.2) % 1) / this.rope.length;
      d.setVisible(lineA > 0.01).setPosition(ax + (this.holeX - ax) * t, ay + (hy - ay) * t).setScale(HD * (1.2 - 0.7 * t)).setAlpha(lineA * (0.4 + 0.6 * t));
    });
  }

  renderDark(dk) {
    const D = CFG.blackZone;
    const b = this.body;
    const on = dk > 0.001;
    this.lantern.setVisible(on && b.state !== S.DEAD);
    if (!on) return;
    const R = D.lanternR;
    const lit = (x, y) => {
      const dy = y - b.y;
      return 1 - smooth01(R * 0.5, R, Math.hypot(x - b.x, dy < 0 ? (dy * R) / D.lanternUp : (dy * R) / D.lanternDown));
    };
    const bright = (floor, l) => 1 - dk * (1 - (floor + (1 - floor) * l)); // lerp(1, lerp(floor, 1, l), dk)
    this.lantern.setPosition(b.x, b.y - (D.lanternUp - D.lanternDown) / 2);
    this.lantern.setDisplaySize(2 * R, D.lanternUp + D.lanternDown);
    this.lantern.setAlpha(dk * D.lanternAlpha * (0.93 + 0.07 * Math.sin(this.simT * 3)));

    for (const h of this.hazards) {
      const l = lit(h.cx, h.y);
      const warn = h.shooter && h.fire?.state === 'warn';
      h.sprite.setTint(warn ? 0xffa090 : grey(bright(h.shooter ? D.floorSpitter : D.floor, l)));
      const a = dk * (D.rimFar + (D.rimNear - D.rimFar) * l) * (0.8 + 0.2 * Math.sin(this.simT * 2.4 + h.phase));
      h.rim.setVisible(true).setPosition(h.cx, h.y).setAlpha(warn ? Math.min(1, a + 0.15) : a);
    }
    for (const p of this.platforms) {
      const l = lit(Math.min(p.x + p.w / 2, Math.max(p.x - p.w / 2, b.x)), p.y);
      p.sprite.setTint(grey(bright(D.floorPlat, l)));
      p.edge.setVisible(true).setAlpha(dk * 0.7);
    }
  }

  update(time, delta) {
    if (this.phase === 'PLAY') {
      this.acc += Math.min(delta, 100) / 1000;
      let n = 0;
      while (this.acc >= STEP && n < 12) {
        this.stepSim(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 12) this.acc = 0;
    }

    this.applyCam();
    this.syncSprite(delta);

    // glowing trail while airborne
    if (this.phase === 'PLAY' && this.body.airborne) {
      this.trailT += delta;
      if (this.trailT > 28) {
        this.trailT = 0;
        const d = this.add.image(this.body.x + (Math.random() - 0.5) * 6, this.body.y + 8, 'dot').setBlendMode(Phaser.BlendModes.ADD).setTint(0x7dffe0).setDepth(27).setScale(HD * 1.1).setAlpha(0.5);
        this.tweens.add({ targets: d, alpha: 0, scale: HD * 0.2, y: d.y + 10, duration: 320, onComplete: () => d.destroy() });
      }
    }

    for (const h of this.hazards) {
      h.sprite.setPosition(h.cx, h.y);
      if (h.shooter) {
        const warn = h.fire?.state === 'warn';
        if (warn !== !!h._warn) {
          h._warn = warn;
          if (warn) h.sprite.setTint(0xffa090);
          else h.sprite.clearTint();
        }
        h.sprite.setScale(HD * (warn ? 1 + 0.1 * Math.abs(Math.sin(this.simT * 16)) : 1));
        h.lane.setAlpha(warn ? 0.3 + 0.3 * Math.abs(Math.sin(this.simT * 14)) : 0);
        continue;
      }
      h.sprite.angle += (h.kind === 'mine' ? 0.4 : 0.8) * (h.speed > 1.1 ? 1 : -1);
    }
    for (const [shot, sp] of this.shotSprites) {
      sp.setPosition(shot.x, shot.y);
      sp.setScale(HD * (1 + 0.12 * Math.sin(this.simT * 20)) * (1 + 0.3 * this.space.dk));
      if (Math.random() < 0.35 + 0.3 * this.space.dk) this.puff(shot.x - Math.sign(shot.vx) * 6, shot.y, 1, 0xff7a4a, true, 0.8);
    }
    for (const c of this.coins) {
      c.sprite.y = c.y + Math.sin(this.simT * 4 + c.t0) * 2;
      c.sprite.scaleX = HD * (0.45 + 0.55 * Math.abs(Math.cos(this.simT * 3 + c.t0)));
    }

    this.space.update(this.camTop, this.time.now / 1000);
    this.renderDark(this.space.dk);
    this.renderPhantom(delta);

    if (this.dbg) {
      this.dbg.setText(`${Math.round(this.game.loop.actualFps)}fps ${this.body.state} h=${this.run.maxHeightM.toFixed(0)}m seed=${this.run.seed} plats=${this.platforms.length}`);
    }
  }
}
