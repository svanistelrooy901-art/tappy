// Spitter behaviour: warn -> fire one orb at the set speed, one direction, only near the screen.
import { ShooterSystem } from '../src/core/shooter.js';
import { CFG } from '../src/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const SH = CFG.shooter, dt = 1 / 120;
const mk = (x, y, dir, phase = 0) => ({ kind: 'spitter', r: 14, x, y, amp: 0, speed: 0, phase, shooter: true, dir, period: 3 });

// left-wall Spitter fires right; the warn comes first, the orb after
{
  const sys = new ShooterSystem(); const h = mk(12, 300, 1);
  const ev = [];
  let t = 0;
  while (t < 5) { sys.step(dt, 0, [h], { onWarn: () => ev.push(['warn', t]), onFire: (s) => ev.push(['fire', t, s]) }); t += dt; }
  ok(ev[0][0] === 'warn' && ev[1][0] === 'fire', 'warn before fire');
  ok(Math.abs((ev[1][1] - ev[0][1]) - SH.warn) < 0.03, `warn lasts ${SH.warn}s (got ${(ev[1][1] - ev[0][1]).toFixed(2)})`);
  ok(ev[1][2].vx === SH.speed && ev[1][2].y === 300, 'orb speed, row');
  ok(ev.filter((e) => e[0] === 'fire').length >= 2, 'fires repeatedly');
  const gap = ev.filter((e) => e[0] === 'fire');
  ok(Math.abs((gap[1][1] - gap[0][1]) - 3) < 0.05, 'period respected');
  ok(sys.shots.every((s) => s.vx > 0), 'only ever travels one way (right)');
}
// right-wall Spitter fires left; orb leaves the screen and is removed
{
  const sys = new ShooterSystem(); const h = mk(CFG.W - 12, 300, -1);
  let gone = 0, n = 0, maxOrbs = 0;
  for (let i = 0; i < 120 * 20; i++) { sys.step(dt, 0, [h], { onGone: () => gone++, onFire: () => n++ }); maxOrbs = Math.max(maxOrbs, sys.shots.length); }
  ok(n >= 5 && gone >= n - 2, `orbs are cleaned up (fired ${n}, gone ${gone})`);
  ok(maxOrbs <= 3, `few orbs at once (${maxOrbs})`);
}
// not running while far above the screen, runs once within activeAbove
{
  const sys = new ShooterSystem(); const h = mk(12, -2000, 1); let n = 0;
  for (let i = 0; i < 120 * 6; i++) sys.step(dt, 0, [h], { onFire: () => n++ });
  ok(n === 0, 'idle while far above the screen');
  const h2 = mk(12, -SH.activeAbove + 20, 1);
  for (let i = 0; i < 120 * 6; i++) sys.step(dt, 0, [h2], { onFire: () => n++ });
  ok(n > 0, 'active once within range above the screen');
}
// below the screen the Spitter stops
{
  const sys = new ShooterSystem(); const h = mk(12, 900, 1); let n = 0;
  for (let i = 0; i < 120 * 6; i++) sys.step(dt, 0, [h], { onFire: () => n++ });
  ok(n === 0, 'stops once the row has scrolled below the screen');
}
// hit test removes the orb, misses leave it
{
  const sys = new ShooterSystem(); sys.shots.push({ x: 100, y: 200, vx: 100, r: SH.r });
  ok(sys.hit(100 + SH.r + CFG.player.hurtR + 5, 200, CFG.player.hurtR) === null && sys.shots.length === 1, 'near miss');
  ok(sys.hit(100 + SH.r + CFG.player.hurtR - 2, 200, CFG.player.hurtR) !== null && sys.shots.length === 0, 'hit removes the orb');
}
// orb is slower than the player's sideways speed (so it can always be outrun)
ok(SH.speed < CFG.physics.lateralVx, 'orb slower than the sidestep');
console.log(fails ? `${fails} FAILURES` : 'shooter: all OK');
process.exit(fails ? 1 : 0);
