import { RunSim, replayRun, SIM_VERSION } from '../src/core/runsim.js';
import { S } from '../src/core/player.js';
import { CFG } from '../src/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const dt = CFG.physics.step, PL = CFG.player;

// A simple pilot (like the bot test): taps while falling, steers toward the safe corridor. quitAtM: stop playing then.
function play(seed, { quitAtM = 600, withRevives = true, pilotSeed = 1 } = {}) {
  const sim = new RunSim(seed);
  let last = -9, guard = 0, revivesDone = 0;
  let r = pilotSeed;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  while (guard++ < 120 * 60 * 20) {
    if (sim.over) {
      if (withRevives && revivesDone === 0 && sim.run.canNormalRevive) { sim.revive('ad'); revivesDone++; continue; }
      if (withRevives && revivesDone === 1 && sim.run.canCoinRevive) { sim.revive('coin'); revivesDone++; continue; }
      break;
    }
    const b = sim.body;
    const playing = sim.run.maxHeightM < quitAtM;
    if (b.canJump && (b.state === S.RESTING || (b.vy > 120 && sim.simT - last > 0.12 + rnd() * 0.05))) {
      if (!playing) { sim.tap(0); last = sim.simT; sim.step(dt); continue; } // reckless: straight up, ignoring hazards, so the run ends
      const tx = sim.gen.corridorX(b.y - 80);
      const px = (d) => Math.min(CFG.W - PL.halfW, Math.max(PL.halfW, b.x + d * CFG.physics.lateralVx * 0.3));
      let best = 0;
      for (const d of [0, -1, 1]) if (Math.abs(px(d) - tx) < Math.abs(px(best) - tx) - 1) best = d;
      sim.tap(rnd() < 0.04 ? 0 : best); // a few "mistakes" so the log is not perfectly regular
      last = sim.simT;
    }
    sim.step(dt);
  }
  return sim;
}

// 1. replaying a recorded run reproduces it exactly (score, coins, ticks, revives), across many worlds
for (const [i, seed] of [7, 104729, 2718281, 31337, 99991, 123456789, 42, 8675309].entries()) {
  const sim = play(seed, { quitAtM: 400 + i * 120, pilotSeed: i + 1 });
  const rec = sim.exportReplay();
  const rep = replayRun(JSON.parse(JSON.stringify(rec))); // through JSON, as the server receives it
  ok(rep.ok, `seed ${seed}: replay accepted (${rep.reason})`);
  ok(rep.heightM === Math.floor(sim.run.maxHeightM), `seed ${seed}: height ${rep.heightM} vs ${Math.floor(sim.run.maxHeightM)}`);
  ok(rep.coins === sim.run.coins, `seed ${seed}: coins ${rep.coins} vs ${sim.run.coins}`);
  ok(rep.ticks === sim.tick, `seed ${seed}: ticks ${rep.ticks} vs ${sim.tick}`);
  ok(rep.revives.ad === sim.run.normalReviveUsed && rep.revives.coin === sim.run.coinReviveUsed, `seed ${seed}: revives`);
}

// 2. it is a pure function of (seed, log): the same log twice gives the same answer
{
  const rec = play(555, { quitAtM: 500 }).exportReplay();
  ok(JSON.stringify(replayRun(rec)) === JSON.stringify(replayRun(rec)), 'replay is deterministic');
}

// 3. cheating attempts do not replay into the claimed score
{
  const sim = play(777, { quitAtM: 700 });
  const rec = sim.exportReplay();
  const honest = replayRun(rec);
  // a: wrong seed
  const a = replayRun({ ...rec, seed: rec.seed + 1 });
  ok(!a.ok || a.heightM !== honest.heightM, 'a different seed does not reproduce the score');
  // b: drop taps (an edited log) => a different outcome
  const b = replayRun({ ...rec, taps: rec.taps.filter((_, i) => i % 5 !== 0) });
  ok(!b.ok || b.heightM !== honest.heightM, 'an edited tap log does not reproduce the score');
  // c: inventing extra revives that did not happen fails (revive must be at a tick where the run really ended)
  const c = replayRun({ ...rec, revives: [[5, 'ad']] });
  ok(!c.ok, 'a revive at a tick where the run was not over is rejected');
  // d: malformed
  ok(!replayRun({ v: 2 }).ok && !replayRun(null).ok && !replayRun({ ...rec, taps: [5, 3] }).ok, 'malformed logs are rejected');
  ok(!replayRun({ ...rec, taps: [-1] }).ok, 'negative tick is rejected');
  ok(!replayRun({ ...rec, sim: SIM_VERSION + 1 }).ok, 'a log from another sim version is rejected, not mis-scored');
  // e: a run that never ends is not a valid submission
  const e = replayRun({ ...rec, taps: [], revives: [] });
  ok(!e.ok && e.reason === 'unfinished', 'no taps: the alien just stands there, so an unfinished run is rejected');
}

// 3b. competitive revives: allowed kinds, once each
{
  const sim = new RunSim(4242);
  let g = 0, done = [];
  const kinds = ['ad', 'coin', 'top10', 'top5'];
  while (g++ < 400000) {
    if (sim.over) { const k = kinds[done.length]; if (!k) break; sim.revive(k); done.push(k); continue; }
    const b = sim.body;
    if (b.canJump && (b.state === S.RESTING || b.vy > 120)) sim.tap(0);
    sim.step(dt);
    if (sim.tick % 3 === 0) sim.step(dt);
  }
  const rec = sim.exportReplay();
  const rep = replayRun(rec);
  ok(rep.ok && rep.revives.top10 && rep.revives.top5 && !rep.revives.top1 && rep.revives.ad && rep.revives.coin, 'replay handles all revive kinds: ' + JSON.stringify(rep.revives));
  ok(!replayRun({ ...rec, revives: [[1, 'top10'], [2, 'top10']] }).ok, 'the same milestone twice is rejected');
  ok(!replayRun({ ...rec, revives: [[1, 'bogus']] }).ok, 'unknown revive kind rejected');
}

// 4. the log is compact and tick-based (no wall-clock anywhere)
{
  const rec = play(31337, { quitAtM: 800 }).exportReplay();
  ok(rec.taps.every(Number.isInteger) && rec.taps.length > 50, `tap log has ${rec.taps.length} integer entries`);
  ok(JSON.stringify(rec).length < 40000, `log size ${JSON.stringify(rec).length} bytes for ${rec.ticks} ticks`);
  console.log(`replay: ${rec.taps.length} taps, ${rec.ticks} ticks (${(rec.ticks * dt).toFixed(0)}s), ${JSON.stringify(rec).length} bytes`);
}

// 5. speed: the server must replay a long run quickly
{
  const rec = play(2718281, { quitAtM: 2600, withRevives: true }).exportReplay();
  const t0 = performance.now();
  const rep = replayRun(rec);
  const ms = performance.now() - t0;
  console.log(`replay of ${rep.heightM} m (${(rep.ticks * dt).toFixed(0)}s of play) took ${ms.toFixed(0)} ms`);
  ok(rep.ok && ms < 5000, 'long replay is fast enough');
}

console.log(fails ? `replay: ${fails} FAILED` : 'replay: all OK');
process.exit(fails ? 1 : 0);
