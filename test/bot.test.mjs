import { WorldGen, heightMOf, bandFor } from '../src/core/gen.js';
import { PlayerBody, S } from '../src/core/player.js';
import { ShooterSystem } from '../src/core/shooter.js';
import { CFG } from '../src/config.js';

const PL = CFG.player, dt = CFG.physics.step, H = CFG.H;
const TARGET_M = +process.env.TARGET_M || 1500;
const SEEDS = +process.env.SEEDS || 25;
const REACT = 0.25; // pilot reaction time to a visible orb (s)

function run(seed, policy) {
  const g = new WorldGen(seed);
  const plats = [], hazards = [];
  const add = (r) => { plats.push(...r.platforms); hazards.push(...r.hazards.map((h) => ({ ...h }))); };
  add(g.rows[0]);
  const b = new PlayerBody({});
  b.spawnAt(plats[0], S.SPAWN, 0);
  let early = 0, camTop = 0, t = 0, hits = 0, falls = 0, maxM = 0, taps = 0, lastTap = -9, orbHits = 0, redHits = 0;
  const sys = new ShooterSystem();
  const seen = new Map(); // orb -> time it first became visible (the pilot reacts REACT seconds later, like a person)
  while (maxM < TARGET_M && t < 3000) {
    while (g.topY > camTop - CFG.gen.aheadPx) add(g.genRow());
    t += dt;
    for (const h of hazards) h.cx = h.x + h.amp * Math.sin(h.speed * t + h.phase);
    sys.step(dt, camTop, hazards);
    // pilot: tap when falling fast enough, steer toward the corridor ahead
    if (b.canJump && policy(b, g, t, lastTap)) {
      // predict where each choice carries us over the next ~0.3s and pick the one nearest the corridor
      const tx = g.corridorX(b.y - 80);
      let best = 0, bd = 1e9;
      for (const d of [0, -1, 1]) {
        const px = Math.min(CFG.W - PL.halfW, Math.max(PL.halfW, b.x + d * CFG.physics.lateralVx * 0.3));
        let e = Math.abs(px - tx);
        // dodge: avoid the spot an orb will occupy, but only orbs on screen for at least REACT seconds
        const py = b.y - 0.3 * 200;
        for (const sh of sys.shots) {
          if (sh.y > camTop + H || sh.y < camTop) continue;
          if (!seen.has(sh)) seen.set(sh, t);
          if (t - seen.get(sh) < REACT) continue;
          if (Math.abs(py - sh.y) < 50 && Math.abs(px - (sh.x + sh.vx * 0.3)) < 34) e += 500;
        }
        if (e < bd - 1) { bd = e; best = d; }
      }
      b.requestJump(best);
      lastTap = t; taps++;
    }
    b.step(dt, plats);
    maxM = Math.max(maxM, heightMOf(b.y + PL.feet));
    if (b.vulnerable) {
      const sh = sys.hit(b.x, b.y, PL.hurtR);
      if (sh) { orbHits++; b.applyHit(sh.x); }
    }
    if (b.vulnerable) for (const h of hazards) {
      if (Math.abs(h.y - b.y) < 60 && Math.hypot(b.x - h.cx, b.y - h.y) < h.r + PL.hurtR) { hits++; if (maxM >= CFG.redZone.fromM) redHits++; if (maxM < Math.min(900, CFG.redZone.fromM)) { early++; if (process.env.VERBOSE) console.log("  early hit seed", seed, "m", Math.floor(maxM), "dev", Math.abs(b.x - g.corridorX(b.y)).toFixed(0), "half", bandFor(maxM).half, "amp", h.amp, "state", b.state, "vy", b.vy.toFixed(0)); } b.applyHit(h.cx); break; }
    }
    if (b.y > camTop + H + CFG.camera.deathMargin) { falls++; b.spawnAt({ x: g.corridorX(camTop + H * 0.55), y: camTop + H * 0.55, air: true }, S.SPAWN, CFG.spawnProtect); }
    const target = b.y - H * CFG.camera.followY;
    if (target < camTop) camTop += (target - camTop) * (1 - Math.exp(-dt * CFG.camera.smooth));
  }
  return { early, hits, falls, orbHits, redHits, maxM: Math.floor(maxM), t: Math.round(t), taps };
}

// A reasonable human-like pilot: tap once falling a little (about every 0.3s at 97px per jump).
const pilot = (b, g, t, last) => b.state === S.RESTING || (b.vy > 120 && t - last > 0.12);
let bad = 0, sum = { hits: 0, falls: 0, early: 0, orb: 0, red: 0 };
for (let s = 1; s <= SEEDS; s++) {
  const r = run(s * 104729, pilot);
  sum.hits += r.hits; sum.falls += r.falls; sum.early += r.early; sum.orb += r.orbHits; sum.red += r.redHits;
  if (r.falls || r.maxM < TARGET_M) { bad++; console.log('seed', s, JSON.stringify(r)); }
}
const zoneM = Math.max(1, TARGET_M - CFG.redZone.fromM);
const orbRate = sum.orb / SEEDS / (zoneM / 100);
const redRate = sum.red / SEEDS / (zoneM / 100);
console.log(`bot: ${SEEDS} worlds to ${TARGET_M}m, hits(total)=${sum.hits} hits(before Red Zone / 900m)=${sum.early} falls=${sum.falls}, bad runs=${bad}`);
console.log(`bot: rock/lava/mine hits in the Red Zone ${redRate.toFixed(2)} per 100m`);
console.log(`bot: Spitter orb hits ${orbRate.toFixed(2)} per 100m of Red Zone (pilot reacts after ${REACT}s)`);
const one = run(3, pilot);
console.log('sample', JSON.stringify(one), `avg climb ${(one.maxM * CFG.score.pxPerMetre / one.t).toFixed(0)} px/s`);
// the bot is imperfect on purpose; the corridor guarantee itself is proven in gen.test. Allow a small bot error rate.
const okRate = sum.early <= Math.ceil(SEEDS * 0.12) && orbRate <= 0.35 && redRate <= 0.15; // orbs must stay dodgeable for a person
console.log(okRate && !bad ? 'bot: OK' : 'bot: FAIL');
process.exit(okRate && !bad ? 0 : 1);
