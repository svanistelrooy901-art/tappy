import { CFG } from '../config.js';

const SH = CFG.shooter;
const { W, H } = CFG;
const TAU = Math.PI * 2;

// Spitter logic, pure JS (no Phaser) so the generator tests and the pilot bot can run it too.
// Cycle per Spitter: idle -> warn (glow + lane line) -> fire ONE orb -> idle.
// A Spitter only runs while its row is near the screen, so orbs are already in flight when the row scrolls in.
export class ShooterSystem {
  constructor() {
    this.shots = [];
  }

  reset() {
    this.shots = [];
  }

  // advance one fixed step. cb: { onWarn(h), onFire(shot, h), onGone(shot) }
  step(dt, camTop, hazards, cb = {}) {
    const top = camTop - SH.activeAbove;
    const bottom = camTop + H;
    for (const h of hazards) {
      if (!h.shooter) continue;
      let s = h.fire;
      if (!s) s = h.fire = { state: 'idle', t: SH.firstDelay[0] + (h.phase / TAU) * (SH.firstDelay[1] - SH.firstDelay[0]) };
      if (h.y < top || h.y > bottom) {
        if (s.state === 'warn') {
          s.state = 'idle';
          s.t = 0.5;
        }
        continue;
      }
      s.t -= dt;
      if (s.state === 'idle' && s.t <= 0) {
        s.state = 'warn';
        s.t = SH.warn;
        cb.onWarn?.(h);
      } else if (s.state === 'warn' && s.t <= 0) {
        const shot = { x: h.x + h.dir * (h.r + 4), y: h.y, vx: h.dir * SH.speed, r: SH.r, from: h };
        this.shots.push(shot);
        s.state = 'idle';
        s.t = Math.max(0.5, h.period - SH.warn);
        cb.onFire?.(shot, h);
      }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.x += sh.vx * dt;
      if (sh.x < -20 || sh.x > W + 20 || sh.y > camTop + H + 80) {
        this.shots.splice(i, 1);
        cb.onGone?.(sh);
      }
    }
  }

  // removes and returns the orb touching a circle at (x, y) with radius r, or null
  hit(x, y, r) {
    for (let i = 0; i < this.shots.length; i++) {
      const sh = this.shots[i];
      if (Math.abs(sh.y - y) < 40 && Math.hypot(sh.x - x, sh.y - y) < sh.r + r) {
        this.shots.splice(i, 1);
        return sh;
      }
    }
    return null;
  }
}
