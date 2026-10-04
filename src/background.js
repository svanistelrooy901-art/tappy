import Phaser from 'phaser';
import { CFG } from './config.js';
import { NEBULA_TINT, RED_NEBULA, RED_STAR_TINT, BLACK_NEBULA, BLACK_STAR_TINT } from './art_hd.js';

const { W, H, Z } = CFG;
const HD = 1 / Z;

const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (a, b, t) => {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
};
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// The layered space backdrop (sky, nebula, stars, planets, motes, foreground rocks).
// Shared by the game and the menus. update(cam, seconds) scrolls it; cam is a world-y "camera top".
export class SpaceBackground {
  constructor(scene, bgLayer, fgLayer) {
    this.scene = scene;
    this.bg = bgLayer;
    const add = (o) => {
      bgLayer.add(o);
      return o;
    };
    this.skies = [0, 1, 2].map((i) => add(scene.add.image(0, 0, `sky_${i}`).setOrigin(0)));

    // Red Zone sky: sits above the normal skies and fades in over CFG.redZone.fadeM metres before the zone starts
    this.skyRed = add(scene.add.image(0, 0, 'sky_red').setOrigin(0).setAlpha(0).setVisible(false));
    this.rz = 0;
    // Black Zone sky: above the red one, fades in over CFG.blackZone.fadeM metres before the zone starts
    this.skyBlack = add(scene.add.image(0, 0, 'sky_black').setOrigin(0).setAlpha(0).setVisible(false));
    this.bz = 0; // sky progress 0..1
    this.dk = 0; // outline + lantern progress 0..1 (ramps in over the last darkRampM metres)

    // parallax layers: two stacked copies that wrap, instead of a TileSprite (which re-uploads a texture every frame)
    this.scrollers = [];
    const scroller = (key, f, scale, additive) => {
      const imgs = [0, 1].map(() => {
        const im = scene.add.image(0, 0, key).setOrigin(0).setScale(scale);
        if (additive) im.setBlendMode(Phaser.BlendModes.ADD);
        return add(im);
      });
      const sc = { imgs, f };
      this.scrollers.push(sc);
      return sc;
    };
    this.nebA = scroller('nebula_a', 0.04, 1, true);
    this.nebB = scroller('nebula_b', 0.075, 1, true);
    scroller('stars_far', 0.1, HD, false);

    const body = (x, key, f, base, s = 1, a = 1) => {
      const im = scene.add.image(x, 0, key).setScale(HD * s).setAlpha(a);
      add(im);
      return { img: im, f, base, span: H + 300 };
    };
    this.planets = [body(292, 'planet_a', 0.06, 130, 1.1, 0.95), body(58, 'planet_b', 0.12, 400, 0.95, 0.95)];
    scroller('stars_mid', 0.2, HD, false);
    this.planets.push(body(238, 'planet_c', 0.2, 560, 0.9, 0.9));
    this.starsNear = scroller('stars_near', 0.34, HD, false);

    // Phantom Zone: the black hole hangs on the screen (not in the world), above the stars so its core hides them.
    this.pz = 0; // fade-in progress 0..1
    this.pullX = 0; // stars lean toward the hole while it pulls (px, signed)
    this.hole = add(scene.add.image(180, 190, 'hole').setScale(HD).setAlpha(0).setVisible(false));
    this.holeRings = [0, 1].map(() => add(scene.add.image(180, 190, 'hole_ring').setScale(HD).setAlpha(0).setVisible(false).setBlendMode(Phaser.BlendModes.ADD)));
    scene.tweens.add({ targets: this.starsNear.imgs, alpha: { from: 0.65, to: 1 }, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // floating light motes (depth cue)
    this.motes = [];
    for (let i = 0; i < 16; i++) {
      const m = scene.add.image(0, 0, 'dot').setBlendMode(Phaser.BlendModes.ADD).setTint(i % 3 ? 0xbfb2ff : 0x9fe8ff);
      const s = 0.5 + Math.random() * 1.1;
      m.setScale(HD * s).setAlpha(0.18 + Math.random() * 0.3);
      add(m);
      this.motes.push({ img: m, x: Math.random() * W, f: 0.35 + s * 0.35, base: Math.random() * (H + 200), ph: Math.random() * 6 });
    }

    // foreground: vignette + big dim rocks drifting past the screen edges
    fgLayer.add(scene.add.image(0, 0, 'vignette').setOrigin(0));
    this.redVig = fgLayer.add(scene.add.image(0, 0, 'vig_red').setOrigin(0).setAlpha(0).setVisible(false));
    this.blackVig = fgLayer.add(scene.add.image(0, 0, 'vig_black').setOrigin(0).setAlpha(0).setVisible(false));
    this.fgRocks = [
      { key: 'fg_rock_a', x: -16, base: 180, f: 1.5, s: 1.1, rot: 0.2 },
      { key: 'fg_rock_b', x: W + 12, base: 420, f: 1.35, s: 1, rot: -0.3 },
      { key: 'fg_rock_a', x: W + 24, base: -80, f: 1.65, s: 1.3, rot: 0.5 },
    ].map((r) => {
      const im = scene.add.image(r.x, 0, r.key).setScale(HD * r.s).setAlpha(0.55);
      fgLayer.add(im);
      return { ...r, img: im, span: H + 360 };
    });
    this._seg = -1;
  }

  update(cam, t) {
    // sky + nebula colour drift with altitude (cross-fades every themeEveryM metres)
    const hM = Math.max(0, (CFG.gen.startY - (cam + H * 0.5)) / CFG.score.pxPerMetre);
    const RZ = CFG.redZone;
    const rz = smooth(RZ.fromM - RZ.fadeM, RZ.fromM, hM);
    this.rz = rz;
    const seg = Math.floor(hM / CFG.themeEveryM);
    const i0 = seg % 3;
    const i1 = (seg + 1) % 3;
    const f = smooth(0.7, 1, (hM % CFG.themeEveryM) / CFG.themeEveryM);
    if (this._seg !== seg) {
      this._seg = seg;
      this.bg.moveTo(this.skies[i1], 2); // the incoming sky is drawn on top while it fades in
    }
    this.skies.forEach((s, i) => s.setAlpha(i === i0 ? 1 : 0).setVisible(i === i0 || i === i1));
    this.skies[i1].setAlpha(f);
    // Black Zone: near-black sky over the crimson one, then everything underneath can be switched off (fill rate)
    const BZ = CFG.blackZone;
    const bz = smooth(BZ.fromM - BZ.fadeM, BZ.fromM, hM);
    this.bz = bz;
    this.dk = smooth(BZ.fromM - BZ.darkRampM, BZ.fromM, hM);
    // Red Zone: crimson sky on top, then the normal skies can be switched off (saves fill rate)
    this.skyRed.setVisible(rz > 0.001 && bz < 0.999).setAlpha(rz);
    if (rz >= 0.999) this.skies.forEach((s) => s.setVisible(false));
    const PZ = CFG.phantomZone;
    this.pz = smooth(PZ.fromM - PZ.fadeM, PZ.fromM, hM);
    this.skyBlack.setVisible(bz > 0.001).setAlpha(bz);
    this.redVig.setVisible(rz > 0.001 && bz < 0.999).setAlpha(rz * (1 - bz) * (0.55 + 0.3 * Math.sin(t * 2.4)));
    this.blackVig.setVisible(bz > 0.001).setAlpha(bz * (0.45 + 0.25 * Math.sin(t * 1.7)));
    const star = lerpColor(lerpColor(0xffffff, RED_STAR_TINT, rz), BLACK_STAR_TINT, bz);
    for (const sc of this.scrollers) if (sc !== this.nebA && sc !== this.nebB) sc.imgs.forEach((im) => im.setTint(star));
    for (const [sc, k, a] of [[this.nebA, 0, 0.55], [this.nebB, 1, 0.5]]) {
      const tint = lerpColor(lerpColor(lerpColor(NEBULA_TINT[i0][k], NEBULA_TINT[i1][k], f), RED_NEBULA[k], rz), BLACK_NEBULA[k], bz);
      sc.imgs.forEach((im) => im.setTint(tint).setAlpha(a * (1 - 0.35 * rz - 0.4 * bz)));
    }
    // decoration dims further in the dark so it can never out-shine a hazard outline
    const decor = lerpColor(0xffffff, 0x2e3048, bz);
    for (const p of this.planets) p.img.setTint(decor);
    for (const r of this.fgRocks) r.img.setTint(decor);
    for (const sc of this.scrollers) {
      const dx = this.pullX * (0.4 + 1.6 * sc.f);
      sc.imgs[0].x = dx;
      sc.imgs[1].x = dx;
      const off = (((-cam * sc.f) % H) + H) % H;
      sc.imgs[0].y = off - H;
      sc.imgs[1].y = off;
    }
    for (const p of this.planets) {
      const v = p.base - cam * p.f;
      p.img.y = (((v % p.span) + p.span) % p.span) - 120;
    }
    for (const m of this.motes) {
      const span = H + 200;
      const v = m.base - cam * m.f;
      m.img.y = (((v % span) + span) % span) - 100;
      m.img.x = m.x + Math.sin(t * 0.6 + m.ph) * 10;
    }
    for (const r of this.fgRocks) {
      const v = r.base - cam * r.f;
      r.img.y = (((v % r.span) + r.span) % r.span) - 180;
      r.img.rotation = r.rot + t * 0.04 * (r.rot > 0 ? 1 : -1);
    }
  }
}
