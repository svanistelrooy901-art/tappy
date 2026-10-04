import { CFG } from '../config.js';
import { mulberry32, rangeOf } from './rng.js';
import { segDist } from './physics.js';

const { W } = CFG;
const PL = CFG.player;
const GEN = CFG.gen;
const RZ = CFG.redZone;
const SH = CFG.shooter;
const TAU = Math.PI * 2;

export const heightMOf = (y) => (GEN.startY - y) / CFG.score.pxPerMetre;

// In the Red Zone every band becomes a slightly harder copy of itself (cached, so bandFor stays cheap).
const redCache = new Map();
function redBand(b) {
  let r = redCache.get(b);
  if (!r) {
    r = {
      ...b,
      half: Math.max(RZ.minHalf, b.half - RZ.halfShrink),
      spacing: b.spacing.map((v) => Math.round(v * RZ.spacingMul)),
      moving: Math.min(RZ.movingMax, b.moving + RZ.movingAdd),
      red: true,
    };
    redCache.set(b, r);
  }
  return r;
}

export function bandFor(hM) {
  let b = CFG.bands[0];
  for (const x of CFG.bands) if (hM >= x.fromM) b = x;
  return hM >= RZ.fromM ? redBand(b) : b;
}

// Distance between two hazards' sweep capsules (horizontal segments at their own heights).
function capsDist(a, b) {
  const dx = Math.max(0, b.x - b.amp - (a.x + a.amp), a.x - a.amp - (b.x + b.amp));
  return Math.hypot(dx, a.y - b.y);
}

/*
 * The world is a safe CORRIDOR with obstacles built around it.
 *
 *  - A centre line winds upward. It drifts sideways no faster than band.slope.
 *  - The player may wander +/- band.half around that line. No hazard (including its full
 *    sweep range) is ever allowed to touch that band. So a clear path ALWAYS exists, however
 *    tightly the gates are squeezed, without needing platforms.
 *  - Rest ledges are rare. They appear on the corridor, with a hazard-free zone around them.
 *
 * The world is built in horizontal slices; each genRow() returns one slice.
 */
export class WorldGen {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.corr = [{ x: W / 2, y: GEN.startY }];
    this.dir = this.rng() < 0.5 ? -1 : 1;
    this.rows = [];
    this.hazards = [];
    this.ledges = [];
    this.cursor = GEN.startY;
    this.lastLedgeY = GEN.startY;
    this.nextLedgeY = GEN.startY - Math.round(rangeOf(this.rng, CFG.bands[0].ledgeEvery));
    this.nextHazY = GEN.startY - GEN.firstClear;
    // first Spitter shows up a little after the Red Zone line, so the banner always comes first
    this.nextShooterY = GEN.startY - RZ.fromM * CFG.score.pxPerMetre - 200;

    const start = { idx: 0, platforms: [{ x: W / 2, y: GEN.startY, w: 152, theme: 0 }], hazards: [], coins: [] };
    this.rows.push(start);
    this.ledges.push(start.platforms[0]);
  }

  get topY() {
    return this.cursor;
  }

  bandAtY(y) {
    return bandFor(heightMOf(y));
  }

  themeAt(y) {
    return Math.floor(Math.max(0, heightMOf(y)) / CFG.themeEveryM) % CFG.themes.length;
  }

  // ---- corridor -----------------------------------------------------------------------
  extendCorridor(toY) {
    const rng = this.rng;
    let last = this.corr[this.corr.length - 1];
    while (last.y > toY) {
      const band = this.bandAtY(last.y);
      const dy = Math.round(rangeOf(rng, [120, 210]));
      const maxDx = band.slope * dy;
      const dx = this.dir * rangeOf(rng, [0.35, 1]) * maxDx;
      if (rng() < 0.45) this.dir *= -1;
      const margin = band.half + 22;
      let nx = last.x + dx;
      if (nx < margin) {
        nx = margin;
        this.dir = 1;
      } else if (nx > W - margin) {
        nx = W - margin;
        this.dir = -1;
      }
      last = { x: nx, y: last.y - dy };
      this.corr.push(last);
    }
  }

  // Centre line x at height y.
  corridorX(y) {
    const c = this.corr;
    if (y >= c[0].y) return c[0].x;
    let lo = 0;
    let hi = c.length - 1;
    if (y <= c[hi].y) return c[hi].x;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid].y >= y) lo = mid;
      else hi = mid;
    }
    const t = (c[lo].y - y) / (c[lo].y - c[hi].y);
    return c[lo].x + (c[hi].x - c[lo].x) * t;
  }

  // ---- hazards ------------------------------------------------------------------------
  validHazard(h) {
    if (h.x - h.amp < -h.r || h.x + h.amp > W + h.r) return false;
    const need = h.r + PL.hurtR + this.bandAtY(h.y).half;
    for (let yy = h.y - need; yy <= h.y + need; yy += 4) {
      if (segDist(this.corridorX(yy), yy, h.x - h.amp, h.x + h.amp, h.y) < need + 1) return false; // +1px: the 4px sampling below can miss a kink by up to ~0.9px
    }
    for (let i = this.hazards.length - 1; i >= 0 && i >= this.hazards.length - 10; i--) {
      const o = this.hazards[i];
      if (capsDist(h, o) < GEN.hazardGapMin) return false;
      // a Spitter's lane needs room: nothing else crowds its row
      if ((o.shooter || h.shooter) && Math.abs(o.y - h.y) < RZ.shooterGapY) return false;
    }
    return true;
  }

  // A Spitter sits in a wall (always the same firing direction). Its body obeys the same corridor rules
  // as any hazard; the orb it fires is a timing threat, telegraphed and slow (see core/shooter.js).
  placeShooter(y, row) {
    const rng = this.rng;
    const cx = this.corridorX(y);
    const nearWall = cx < W / 2 ? -1 : 1; // wall closest to the corridor
    const walls = rng() < 0.65 ? [-nearWall, nearWall] : [nearWall, -nearWall]; // mostly the far wall: longer reaction time
    for (const wall of walls) {
      const r = CFG.hazards.spitter.r;
      const h = {
        kind: 'spitter',
        r,
        x: wall < 0 ? 18 : W - 18,
        y: Math.round(y),
        amp: 0,
        speed: 0,
        phase: +(rng() * TAU).toFixed(2),
        shooter: true,
        dir: -wall, // fires away from its wall, across the screen
        period: +rangeOf(rng, SH.period).toFixed(2),
      };
      if (!this.validHazard(h)) continue;
      this.hazards.push(h);
      row.hazards.push(h);
      this.nextShooterY = y - Math.round(rangeOf(rng, RZ.shooterEvery));
      return true;
    }
    return false;
  }

  placeLevel(y, band, row) {
    if (band.red && y <= this.nextShooterY && this.placeShooter(y, row)) return;
    const rng = this.rng;
    const cx = this.corridorX(y);
    const kindOf = () => band.kinds[Math.floor(rng() * band.kinds.length)];
    const make = (side, slackMax) => {
      const kind = kindOf();
      const r = CFG.hazards[kind].r;
      const dist = band.half + r + PL.hurtR + rangeOf(rng, [0, slackMax]);
      return {
        kind,
        r,
        x: Math.round(cx + side * dist),
        y: Math.round(y + rangeOf(rng, [-18, 18])),
        amp: 0,
        want: rng() < band.moving ? rangeOf(rng, [30, 80]) : 0,
        speed: +rangeOf(rng, [0.7, 1.6]).toFixed(2),
        phase: +(rng() * Math.PI * 2).toFixed(2),
      };
    };

    const specs =
      rng() < band.gateP
        ? [make(-1, band.slackMax), make(1, band.slackMax)]
        : [make(rng() < 0.5 ? -1 : 1, band.slackMax * 1.6)];

    for (const h of specs) {
      let amp = h.want;
      while (amp > 0 && !this.validHazard({ ...h, amp })) amp = Math.floor(amp * 0.7);
      h.amp = amp < 12 ? 0 : Math.round(amp);
      delete h.want;
      if (!this.validHazard(h)) continue;
      this.hazards.push(h);
      row.hazards.push(h);
    }
  }

  // ---- one slice of world -------------------------------------------------------------
  genRow() {
    const rng = this.rng;
    const bottom = this.cursor;
    const top = this.cursor - GEN.sliceH;
    this.extendCorridor(top - 320);
    const row = { idx: this.rows.length, platforms: [], hazards: [], coins: [] };

    // rest ledges (rare), sitting on the corridor
    while (this.nextLedgeY >= top) {
      const y = Math.round(this.nextLedgeY);
      const band = this.bandAtY(y);
      const w = 2 * Math.round(rangeOf(rng, band.ledgeW) / 2);
      const cx = this.corridorX(y) + rangeOf(rng, [-18, 18]);
      const p = { x: Math.round(Math.min(W - w / 2 - 6, Math.max(w / 2 + 6, cx))), y, w, theme: this.themeAt(y) };
      row.platforms.push(p);
      this.ledges.push(p);
      this.lastLedgeY = y;
      this.nextLedgeY = y - Math.round(rangeOf(rng, band.ledgeEvery));
      if (rng() < 0.5) row.coins.push({ x: p.x, y: p.y - 34 });
    }

    // hazard levels
    while (this.nextHazY >= top) {
      const y = Math.round(this.nextHazY);
      const band = this.bandAtY(y);
      this.nextHazY -= Math.round(rangeOf(rng, band.spacing));
      if (band.hzP <= 0 || rng() >= band.hzP) continue;
      if (Math.abs(y - this.lastLedgeY) < GEN.ledgeClear || Math.abs(y - this.nextLedgeY) < GEN.ledgeClear) continue;
      this.placeLevel(y, band, row);
    }

    // coin trail along the safe corridor
    if (rng() < GEN.coinTrailChance) {
      const y0 = bottom - rangeOf(rng, [30, GEN.sliceH - 140]);
      const n = 3 + Math.floor(rng() * 4);
      const phase = rng() * 6;
      for (let i = 0; i < n; i++) {
        const y = Math.round(y0 - i * 36);
        const band = this.bandAtY(y);
        row.coins.push({ x: Math.round(this.corridorX(y) + Math.sin(i * 0.9 + phase) * band.half * 0.35), y });
      }
    }
    // close-shave coins: just outside a still hazard, on the corridor side
    for (const h of row.hazards) {
      if (h.amp > 0 || rng() > 0.5) continue;
      const side = Math.sign(this.corridorX(h.y) - h.x) || 1;
      const c = { x: Math.round(h.x + side * (h.r + PL.hurtR + 24)), y: h.y };
      if (c.x < 14 || c.x > W - 14) continue;
      const clear = this.hazards.every((o) => segDist(c.x, c.y, o.x - o.amp, o.x + o.amp, o.y) >= o.r + PL.hurtR + 20);
      if (clear) row.coins.push(c);
    }

    this.cursor = top;
    this.rows.push(row);
    return row;
  }
}
