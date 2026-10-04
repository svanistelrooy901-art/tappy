import { PlayerBody, S } from '../src/core/player.js';
import { CFG } from '../src/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const dt = CFG.physics.step, FEET = CFG.player.feet, V = CFG.physics.jumpVy, G = CFG.physics.gravity;
const mk = () => { const ev = { jumps: [], lands: 0, bad: 0 }; const b = new PlayerBody({ onJump: (d, g) => ev.jumps.push([d, g]), onLand: () => ev.lands++, onBadTransition: () => ev.bad++ }); return { b, ev }; };
const run = (b, sec, plats = []) => { for (let t = 0; t < sec; t += dt) b.step(dt, plats); };
const plat = { x: 180, y: 500, w: 200 };

// 1. no tap, no jump
{ const { b } = mk(); b.spawnAt(plat, S.SPAWN, 0); run(b, 6, [plat]); ok(b.state === S.RESTING, 'rests with no input'); ok(Math.abs(b.y - (500 - FEET)) < 0.01, 'stays put'); }

// 2. ground jump height and landing
{ const { b, ev } = mk(); b.spawnAt(plat, S.SPAWN, 0); run(b, 0.5, [plat]); b.requestJump(0);
  let top = b.y; for (let t = 0; t < 1.5; t += dt) { b.step(dt, [plat]); top = Math.min(top, b.y); }
  const rise = (500 - FEET) - top; ok(Math.abs(rise - (V * V) / (2 * G)) < 1.5, `apex ${rise}`); ok(b.state === S.RESTING && ev.lands === 1, 'lands back'); ok(ev.jumps[0][1] === true, 'first jump is from ground'); }

// 3. unlimited mid-air jumps: every tap re-launches, no cap
{ const { b, ev } = mk(); b.spawnAt(plat, S.SPAWN, 0); run(b, 0.5, [plat]); b.requestJump(0); let n = 1;
  for (let i = 0; i < 40; i++) { run(b, 0.2, [plat]); ok(b.requestJump(0), 'air tap accepted'); n++; }
  ok(b.y < 500 - FEET - 400, `climbed high by tapping (${b.y})`); ok(ev.jumps.length === n, 'every tap jumped'); ok(ev.jumps[5][1] === false, 'air jump flagged not-from-ground'); ok(ev.bad === 0, 'no bad transitions'); }

// 4. air jump direction steers
{ const { b } = mk(); b.spawnAt({ x: 180, y: 500, air: true }, S.SPAWN, 0); b.requestJump(1); run(b, 0.2); ok(b.x > 200, 'right tap moves right'); b.requestJump(-1); run(b, 0.2); ok(b.x < 215, 'left tap moves left'); }

// 5. no tap in the air = pure fall, no auto jump
{ const { b } = mk(); b.spawnAt({ x: 180, y: 300, air: true }, S.SPAWN, 0); run(b, 2, []); ok(b.state === S.FALLING && b.y > 300 + 400, 'falls with no input'); ok(Math.abs(b.vy) <= CFG.physics.maxFall + 1e-6, 'terminal speed'); }

// 6. mid-air spawn hovers then falls
{ const { b } = mk(); b.spawnAt({ x: 180, y: 300, air: true }, S.SPAWN, 1); run(b, 0.3); ok(b.state === S.SPAWN && b.y === 300, 'hover'); run(b, 0.6); ok(b.state === S.FALLING, 'then falls'); }

// 7. tapping while hovering at spawn works
{ const { b } = mk(); b.spawnAt({ x: 180, y: 300, air: true }, S.SPAWN, 1); ok(b.requestJump(0) && b.state === S.JUMPING, 'tap during spawn hover jumps'); }

// 8. dead never jumps
{ const { b } = mk(); b.spawnAt(plat, S.SPAWN, 0); b.kill(); ok(!b.requestJump(0), 'dead cannot jump'); }

// 9. hit stun: no tap at first, then tap works; invulnerable after hit
{ const { b } = mk(); b.spawnAt(plat, S.SPAWN, 0); run(b, 0.5, [plat]); b.requestJump(0); run(b, 0.1);
  ok(b.applyHit(100), 'hit applies'); ok(!b.requestJump(0), 'no tap right after hit'); run(b, CFG.physics.stunTapAfter + 0.01); ok(b.requestJump(0), 'tap works after flinch'); ok(!b.applyHit(100), 'invulnerable after hit'); }

// 10. edge landing and one-way platform
{ const { b } = mk(); b.spawnAt({ x: 180, y: 300, air: true }, S.SPAWN, 0); b.state = S.FALLING; b.stateT = 0; b.y = 400; run(b, 1, [plat]); ok(b.state === S.RESTING && b.platform === plat, 'lands on platform from above'); }
{ const { b } = mk(); b.spawnAt({ x: 180, y: 600, air: true }, S.SPAWN, 0); b.transition(S.JUMPING); b.vy = -700; run(b, 0.25, [{ x: 180, y: 560, w: 200 }]); ok(b.platform === null, 'passes up through a platform'); }

// 11. screen edges clamp
{ const { b } = mk(); b.spawnAt({ x: 20, y: 300, air: true }, S.SPAWN, 0); b.requestJump(-1); run(b, 1); ok(b.x >= CFG.player.halfW - 1e-6, 'left wall'); }

console.log(fails ? `${fails} FAILURES` : 'player: all OK');
process.exit(fails ? 1 : 0);
