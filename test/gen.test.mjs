import { WorldGen, heightMOf, bandFor } from '../src/core/gen.js';
import { CFG } from '../src/config.js';
import { segDist } from '../src/core/physics.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; if (fails < 25) console.log('FAIL', m); } };
const PL = CFG.player;
const SEEDS = 60, SLICES = 160;
let shooters = 0, hz = 0, ledges = 0, coins = 0, maxSlope = 0, minGap = 1e9;

for (let s = 1; s <= SEEDS; s++) {
  const g = new WorldGen(s * 7919);
  const g2 = new WorldGen(s * 7919);
  const rows = [g.rows[0]];
  for (let i = 0; i < SLICES; i++) { rows.push(g.genRow()); g2.genRow(); }
  ok(JSON.stringify(rows.map((r) => [r.platforms.map((p) => [p.x, p.y, p.w]), r.hazards.map((h) => [h.x, h.y, h.amp]), r.coins.length])) ===
     JSON.stringify(g2.rows.slice(1).length ? [g2.rows[0], ...g2.rows.slice(1)].map((r) => [r.platforms.map((p) => [p.x, p.y, p.w]), r.hazards.map((h) => [h.x, h.y, h.amp]), r.coins.length]) : []), `seed ${s} not deterministic`);

  const all = rows.flatMap((r) => r.hazards);
  const lg = rows.flatMap((r) => r.platforms);
  hz += all.length; ledges += lg.length; coins += rows.reduce((a, r) => a + r.coins.length, 0);

  // corridor slope never exceeds the band's limit
  for (let i = 1; i < g.corr.length; i++) {
    const a = g.corr[i - 1], b = g.corr[i];
    const sl = Math.abs(b.x - a.x) / (a.y - b.y);
    maxSlope = Math.max(maxSlope, sl);
    ok(sl <= bandFor(heightMOf(a.y)).slope + 1e-6, `seed ${s} slope ${sl}`);
  }
  // independent clearance check: every hazard keeps the whole safe band free
  for (const h of all) {
    const half = bandFor(heightMOf(h.y)).half;
    const need = h.r + PL.hurtR + half;
    for (let yy = h.y - need; yy <= h.y + need; yy += 3) {
      const d = segDist(g.corridorX(yy), yy, h.x - h.amp, h.x + h.amp, h.y);
      ok(d >= need - 0.5, `seed ${s} hazard@${h.y} intrudes corridor d=${d.toFixed(1)} need=${need.toFixed(1)}`);
    }
    ok(h.x - h.amp >= -h.r && h.x + h.amp <= CFG.W + h.r, `seed ${s} hazard off-screen`);
  }
  // hazard spacing + ledge clearance
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (Math.abs(a.y - b.y) > 200) continue;
    const dx = Math.max(0, b.x - b.amp - (a.x + a.amp), a.x - a.amp - (b.x + b.amp));
    const d = Math.hypot(dx, a.y - b.y);
    minGap = Math.min(minGap, d);
    ok(d >= CFG.gen.hazardGapMin - 0.01, `seed ${s} hazards too close ${d.toFixed(1)}`);
  }
  for (const p of lg.slice(1)) for (const h of all) ok(Math.abs(h.y - p.y) >= CFG.gen.ledgeClear - 20 - 0.01, `seed ${s} hazard near ledge`);
  // Spitters: only in the Red Zone, mounted in a wall, firing across the screen, with their row kept clear
  const sp = all.filter((h) => h.shooter);
  shooters += sp.length;
  for (const h of sp) {
    ok(heightMOf(h.y) >= CFG.redZone.fromM - 1, `seed ${s} Spitter below the Red Zone`);
    ok(h.x < 20 || h.x > CFG.W - 20, `seed ${s} Spitter not on a wall`);
    ok(h.dir === (h.x < CFG.W / 2 ? 1 : -1), `seed ${s} Spitter fires into its wall`);
    ok(h.amp === 0, `seed ${s} Spitter moves`);
    for (const o of all) if (o !== h) ok(Math.abs(o.y - h.y) >= CFG.redZone.shooterGapY - 0.01, `seed ${s} hazard crowds a Spitter lane`);
  }
  for (let i = 1; i < sp.length; i++) ok(sp[i - 1].y - sp[i].y >= CFG.redZone.shooterEvery[0] - 0.01, `seed ${s} Spitters too frequent`);
  ok(all.every((h) => h.shooter || h.kind !== 'spitter'), `seed ${s} stray spitter kind`);
  // ledges are rare
  for (let i = 1; i < lg.length; i++) ok(lg[i - 1].y - lg[i].y >= 700, `seed ${s} ledges too frequent`);
}
console.log(`seeds=${SEEDS} spitters=${shooters} hazards=${hz} ledges=${ledges} coins=${coins} maxSlope=${maxSlope.toFixed(3)} minHazGap=${minGap.toFixed(1)}`);
ok(shooters > SEEDS * 5, 'Red Zone produces Spitters');
console.log(fails ? `${fails} FAILURES` : 'gen: all OK');
process.exit(fails ? 1 : 0);
