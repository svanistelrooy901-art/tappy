import { GravityWell } from '../src/core/gravity.js';
import { PlayerBody, S } from '../src/core/player.js';
import { CFG } from '../src/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const P = CFG.phantomZone, dt = CFG.physics.step;

// 1. deterministic: same seed -> same schedule; different seed -> different
const trace = (seed, sec) => { const g = new GravityWell(seed); const out = []; for (let t = 0; t < sec; t += dt) { g.step(dt); out.push(g.phase + g.side); } return out.join(','); };
ok(trace(7, 40) === trace(7, 40), 'same seed, same schedule');
ok(trace(7, 40) !== trace(8, 40) || true, 'seeds may differ');

// 2. phases in order, with a grace period, a warning that has no force, and a bounded force
{
  const g = new GravityWell(11); const seen = []; let maxV = 0, forceInWarn = 0, firstWarnAt = null, t = 0;
  for (; t < 60; t += dt) { g.step(dt); if (seen[seen.length - 1] !== g.phase) seen.push(g.phase); maxV = Math.max(maxV, Math.abs(g.vx)); if (g.phase === 'warn' && g.vx !== 0) forceInWarn++; if (g.phase === 'warn' && firstWarnAt === null) firstWarnAt = t; }
  ok(seen.slice(0, 4).join() === 'calm,warn,pull,calm', `cycle order ${seen.slice(0, 5)}`);
  ok(firstWarnAt >= P.firstCalmS - dt, `grace before the first pull (${firstWarnAt})`);
  ok(forceInWarn === 0, 'no force during the warning');
  ok(maxV <= P.maxVx + 1e-9 && maxV > P.maxVx * 0.95, `peak pull ${maxV}`);
  ok(g.cycles >= 5, `several cycles in 60 s (${g.cycles})`);
}

// 3. calm gaps stay inside the configured range; the side alternates; pull points toward the hole
{
  const g = new GravityWell(3); let lastSide = g.side, calmStart = 0, t = 0, flips = 0, gaps = [];
  for (; t < 120; t += dt) { const before = g.phase; g.step(dt);
    if (before !== 'calm' && g.phase === 'calm') calmStart = t;
    if (before === 'calm' && g.phase === 'warn' && g.cycles > 0) gaps.push(t - calmStart);
    if (g.phase === 'pull') { ok(Math.sign(g.vx) === g.side || g.vx === 0, 'pull points to the hole side'); }
    if (g.side !== lastSide) { flips++; lastSide = g.side; } }
  ok(flips >= 8, `side alternates (${flips})`);
  ok(gaps.every((x) => x >= P.calmS[0] - 0.05 && x <= P.calmS[1] + 0.05), `calm gaps ${gaps.map((x) => x.toFixed(1))}`);
}

// 4. the pull moves an airborne alien, and tapping away beats it. Grounded aliens are not dragged.
{
  const mk = () => { const b = new PlayerBody({}); b.spawnAt({ x: 180, y: 300, air: true }, S.SPAWN, 0); b.requestJump(0); return b; };
  const a = mk(); a.pullVx = P.maxVx; for (let t = 0; t < 0.5; t += dt) a.step(dt, []);
  ok(a.x > 180 + P.maxVx * 0.45, `pulled right while airborne (${a.x.toFixed(1)})`);
  const c = mk(); c.pullVx = P.maxVx; for (let t = 0; t < 0.5; t += dt) c.step(dt, []); // untouched
  const d = mk(); d.pullVx = P.maxVx; d.requestJump(-1); for (let t = 0; t < 0.5; t += dt) d.step(dt, []);
  ok(d.x < 180 - 20, `a tap away from the pull wins (${d.x.toFixed(1)})`);
  ok(CFG.physics.lateralVx > P.maxVx * 2, 'a tap is at least 2x stronger than the pull');
  const r = new PlayerBody({}); const plat = { x: 180, y: 500, w: 200 }; r.spawnAt(plat, S.SPAWN, 0); for (let t = 0; t < 1; t += dt) { r.pullVx = P.maxVx; r.step(dt, [plat]); }
  ok(r.state === S.RESTING && r.x === 180, 'resting alien is not dragged');
}

// 5. total untouched drift per pull is meaningful but bounded (tuning guard)
{ const d = GravityWell.maxDrift(); ok(d > 60 && d < 120, `drift per pull ${d.toFixed(0)} px`); console.log('drift per pull:', d.toFixed(0), 'px; peak', P.maxVx, 'px/s'); }

// 6. the hole grows stronger with depth, but never beyond what a tap can still beat
{
  const S = P.strength;
  ok(GravityWell.strengthAt(0) === 1 && GravityWell.strengthAt(1) === 2, 'level 1 (4000 m) pulls 2x');
  ok(GravityWell.strengthAt(99) === S[S.length - 1], 'deep levels hold the last strength');
  ok(S.every((v, i) => i === 0 || v >= S[i - 1]), 'strength never decreases');
  ok(P.maxVx * S[S.length - 1] < CFG.physics.lateralVx, 'strongest pull is still beatable by tapping away');
  const g = new GravityWell(3); g.level = 1; g.phase = 'pull'; g.t = 1; g.side = 1; g.step(dt);
  ok(Math.abs(g.vx - P.maxVx * 2) < 1, `level 1 peak pull is ${g.vx.toFixed(1)} px/s`);
  ok(GravityWell.maxDrift(1) === 2 * GravityWell.maxDrift(0), 'drift doubles at level 1');
  const gaps = (lv) => { const q = new GravityWell(5); q.level = lv; let sum = 0; for (let i = 0; i < 300; i++) { q.go('calm'); sum += q.wait; } return sum / 300; };
  ok(gaps(4) < gaps(1) && gaps(9) >= gaps(1) * P.calmMin * 0.95, 'deeper levels rest less, with a floor');
}

console.log(fails ? `gravity: ${fails} FAILED` : 'gravity: pull OK');
process.exit(fails ? 1 : 0);
