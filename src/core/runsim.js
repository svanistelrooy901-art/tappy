import { CFG } from '../config.js';
import { WorldGen, heightMOf } from './gen.js';
import { PlayerBody, S } from './player.js';
import { RunState } from './session.js';
import { ShooterSystem } from './shooter.js';
import { GravityWell } from './gravity.js';

const PL = CFG.player;
const H = CFG.H;

// Bump this whenever a change alters how a run plays out (physics, level generation, hazards, zones). The server only
// replays logs whose version it knows; old logs from old game versions are then rejected instead of mis-scored.
export const SIM_VERSION = 1;

// competitive revive kinds, one per leaderboard milestone
export const MILESTONE_KINDS = { top10: 1, top5: 1, top1: 1 };
export const REVIVE_KINDS = ['ad', 'coin', 'top10', 'top5', 'top1'];

// THE authoritative simulation of one run. No Phaser, no DOM, no audio: the game scene drives it and draws what it
// does, and the V1.1 server replays a recorded tap log through the very same class to verify a submitted score.
// Everything that decides a score lives here; the scene only reacts through the optional `hooks`.
//
// Determinism contract: the run is a pure function of (seed, ordered input log). Time only moves in whole fixed steps
// (`tick`), taps and revives are logged against the tick they happened on, and nothing here reads a clock or Math.random.
export class RunSim {
  constructor(seed, hooks = {}) {
    this.hooks = hooks;
    this.run = new RunState(seed);
    this.gen = new WorldGen(this.run.seed);
    this.gravity = new GravityWell(this.run.seed);
    this.shooters = new ShooterSystem();
    this.platforms = [];
    this.hazards = [];
    this.coins = [];
    this.timers = [];
    this.simT = 0;
    this.tick = 0;
    this.camTop = 0;
    this.over = false; // the run has ended (lives gone, death animation finished); a revive can reopen it
    this.log = { taps: [], revives: [] }; // taps: tick*3+(dir+1); revives: [tick, 'ad'|'coin']
    this.body = new PlayerBody({
      onJump: (d, g) => hooks.onJump?.(d, g),
      onLand: (p, v) => hooks.onLand?.(p, v),
      onBadTransition: (a, b) => hooks.onBadTransition?.(a, b),
    });
    this.addRow(this.gen.rows[0]);
    this.topUpWorld();
    this.body.spawnAt(this.platforms[0], S.SPAWN, 0);
  }

  // ------------------------------------------------------------------ world
  addRow(row) {
    for (const p of row.platforms) this.platforms.push(p);
    for (const h of row.hazards) {
      h.cx = h.x;
      this.hazards.push(h);
    }
    for (const c of row.coins) this.coins.push(c);
    this.hooks.onRow?.(row);
  }

  topUpWorld() {
    while (this.gen.topY > this.camTop - CFG.gen.aheadPx) this.addRow(this.gen.genRow());
  }

  // drop whatever has scrolled far below the camera (no effect on play, keeps the lists short)
  cleanup() {
    const limit = this.camTop + H + CFG.gen.keepBelowPx;
    const sweep = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].y > limit) {
          this.hooks.onRemove?.(arr[i]);
          arr.splice(i, 1);
        }
      }
    };
    sweep(this.platforms);
    sweep(this.hazards);
    sweep(this.coins);
  }

  later(sec, cb) {
    this.timers.push({ t: this.simT + sec, cb });
  }

  // ------------------------------------------------------------------ input
  // A tap. Returns true if the alien actually jumped. Only accepted taps are logged (rejected ones change nothing).
  tap(dir) {
    if (this.over) return false;
    const ok = this.body.requestJump(dir);
    if (ok) this.log.taps.push(this.tick * 3 + (dir + 1));
    return ok;
  }

  // ------------------------------------------------------------------ life / death
  // Mid-air respawn spot: in the safe corridor, a bit below the middle of the screen
  pickRespawn() {
    const y = this.camTop + H * 0.55;
    return { x: this.gen.corridorX(y), y, air: true };
  }

  respawn(kind, protect) {
    this.body.spawnAt(this.pickRespawn(), kind, protect);
    this.hooks.onRespawn?.(kind);
  }

  loseLife(cause, hz) {
    const run = this.run;
    run.lives = Math.max(0, run.lives - 1);
    if (run.lives > 0) {
      if (cause === 'fall') {
        this.body.kill();
        this.later(0.45, () => this.respawn(S.SPAWN, CFG.spawnProtect));
      } else {
        this.body.applyHit(hz.cx);
      }
    } else {
      this.body.kill();
      this.later(0.75, () => this.endRun());
    }
    this.hooks.onLoseLife?.(cause, run.lives);
  }

  endRun() {
    this.over = true;
    this.run.status = 'ended';
    this.run.endedAt = Date.now();
    this.hooks.onEnd?.();
  }

  // A revive after the run ended: the ad revive, or the coin revive (the scene has already charged the coins).
  // Same run id, same score; only lives and the respawn change.
  revive(kind) {
    const run = this.run;
    if (kind === 'coin') {
      run.coinReviveUsed = true;
      run.lives = CFG.coinRevive.lives;
    } else if (kind in MILESTONE_KINDS) {
      // competitive revive (V1.1): an ad, once per milestone per run. Eligibility (within 90% of the milestone) is decided
      // by the scene from the live leaderboard; the sim only enforces "once per milestone".
      run.competitiveReviveUsed[kind] = true;
      run.lives = CFG.competitiveRevive.lives;
    } else {
      run.normalReviveUsed = true;
      run.lives = CFG.reviveLives;
    }
    this.log.revives.push([this.tick, kind]);
    this.over = false;
    this.respawn(S.REVIVING, CFG.reviveProtect);
  }

  // ------------------------------------------------------------------ one fixed step
  step(dt) {
    if (this.over) return;
    this.tick++;
    this.simT += dt;
    const body = this.body;
    const run = this.run;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].t <= this.simT) {
        const cb = this.timers[i].cb;
        this.timers.splice(i, 1);
        cb();
      }
    }

    for (const h of this.hazards) h.cx = h.x + h.amp * Math.sin(h.speed * this.simT + h.phase);

    this.shooters.step(dt, this.camTop, this.hazards, {
      onWarn: (h) => this.hooks.onSpitWarn?.(h, this.camTop),
      onFire: (shot, h) => this.hooks.onSpitFire?.(shot, h, this.camTop),
      onGone: (shot) => this.hooks.onShotGone?.(shot),
    });

    // Phantom Zone: the black hole's schedule only runs once the zone is entered; it only drags an airborne alien
    const G = this.gravity;
    if (run.inPhantomZone) {
      G.level = run.phantomLevel;
      const before = G.phase;
      G.step(dt);
      if (G.phase !== before) this.hooks.onPullPhase?.(G.phase);
    }
    body.pullVx = run.inPhantomZone && body.airborne ? G.vx : 0;

    body.step(dt, this.platforms);

    const live = body.state === S.RESTING || body.airborne;
    if (live) {
      const hM = heightMOf(body.y + PL.feet);
      if (hM > run.maxHeightM) {
        const before = Math.floor(run.maxHeightM);
        run.addHeight(hM);
        this.hooks.onHeight?.(before);
      }

      // coins
      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i];
        if (Math.hypot(body.x - c.x, body.y - c.y) < 18) {
          run.addPickup();
          this.coins.splice(i, 1);
          this.hooks.onCoin?.(c);
        }
      }

      // hazards
      if (body.vulnerable) {
        let hit = false;
        for (const h of this.hazards) {
          if (Math.abs(h.y - body.y) < 60 && Math.hypot(body.x - h.cx, body.y - h.y) < h.r + PL.hurtR) {
            this.loseLife('hazard', h);
            hit = true;
            break;
          }
        }
        if (!hit) {
          const shot = this.shooters.hit(body.x, body.y, PL.hurtR);
          if (shot) {
            this.hooks.onShotHit?.(shot);
            this.loseLife('hazard', { cx: shot.x });
          }
        }
      }

      // falling below the visible play area
      if (live && body.y > this.camTop + H + CFG.camera.deathMargin) this.loseLife('fall');
    }

    // camera only ever follows upward; never oscillates down
    if (body.state !== S.DEAD) {
      const target = body.y - H * CFG.camera.followY;
      if (target < this.camTop) this.camTop += (target - this.camTop) * (1 - Math.exp(-dt * CFG.camera.smooth));
    }
    this.topUpWorld();
    this.cleanup();
  }

  // ------------------------------------------------------------------ replay
  exportReplay() {
    return { v: 1, sim: SIM_VERSION, seed: this.run.seed, ticks: this.tick, taps: this.log.taps.slice(), revives: this.log.revives.map((r) => r.slice()) };
  }
}

// Re-run a recorded run headlessly. Returns what the run was worth, or { ok:false, reason } if the log is malformed.
// The server calls this; the same function is used by the equivalence tests against the real game.
export function replayRun(rec, opts = {}) {
  const maxTicks = opts.maxTicks ?? 120 * 60 * 60; // an hour of play
  if (!rec || rec.v !== 1 || rec.sim !== SIM_VERSION || !Number.isInteger(rec.seed) || !Array.isArray(rec.taps) || !Array.isArray(rec.revives)) return { ok: false, reason: 'format' };
  const dt = CFG.physics.step;
  const sim = new RunSim(rec.seed);
  let ti = 0, ri = 0;
  const taps = rec.taps;
  // taps must be strictly non-decreasing in time
  for (let i = 0; i < taps.length; i++) {
    if (!Number.isInteger(taps[i]) || taps[i] < 0 || (i > 0 && taps[i] < taps[i - 1])) return { ok: false, reason: 'taps' };
  }
  for (let i = 0; i < rec.revives.length; i++) {
    const r = rec.revives[i];
    if (!Array.isArray(r) || !Number.isInteger(r[0]) || !REVIVE_KINDS.includes(r[1])) return { ok: false, reason: 'revives' };
    if (i > 0 && r[0] < rec.revives[i - 1][0]) return { ok: false, reason: 'revives' };
  }
  // each kind at most once per run
  if (new Set(rec.revives.map((r) => r[1])).size !== rec.revives.length) return { ok: false, reason: 'revives' };
  const applyTaps = () => {
    while (ti < taps.length && Math.floor(taps[ti] / 3) <= sim.tick) {
      if (Math.floor(taps[ti] / 3) < sim.tick) return false; // a tap that should already have happened
      sim.tap((taps[ti] % 3) - 1);
      ti++;
    }
    return true;
  };
  while (sim.tick < maxTicks) {
    if (sim.over) {
      // the run ended: a logged revive at exactly this tick reopens it, otherwise the run is over
      const r = rec.revives[ri];
      if (r && r[0] === sim.tick) {
        sim.revive(r[1]);
        ri++;
        continue;
      }
      break;
    }
    if (!applyTaps()) return { ok: false, reason: 'taps' };
    sim.step(dt);
  }
  if (!sim.over) return { ok: false, reason: 'unfinished' };
  if (ti < taps.length || ri < rec.revives.length) return { ok: false, reason: 'trailing' };
  return {
    ok: true,
    ticks: sim.tick,
    heightM: Math.floor(sim.run.maxHeightM),
    coins: sim.run.coins,
    revives: { ad: sim.run.normalReviveUsed, coin: sim.run.coinReviveUsed, ...sim.run.competitiveReviveUsed },
    taps: taps.length,
  };
}
