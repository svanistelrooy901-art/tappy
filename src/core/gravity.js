import { CFG } from '../config.js';
import { mulberry32 } from './rng.js';

// The Phantom Zone black hole. Pure logic (no Phaser), seeded by the run, so it is deterministic and testable.
// Cycle: calm -> warn (telegraph, no force yet) -> pull (a sideways force toward the hole) -> calm ...
// The hole sits on one side of the screen; the side alternates each cycle (random start).
export class GravityWell {
  constructor(seed) {
    this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    this.reset();
  }

  reset() {
    const P = CFG.phantomZone;
    this.phase = 'calm'; // calm | warn | pull
    this.t = 0;
    this.side = this.rng() < 0.5 ? -1 : 1; // -1 = hole on the left, +1 = on the right
    this.wait = P.firstCalmS;
    this.vx = 0; // current sideways pull velocity (px/s), signed: toward the hole
    this.k = 0; // 0..1 how strongly the hole is acting right now (for visuals)
    this.warn = 0; // 0..1 telegraph progress during the warn phase
    this.cycles = 0;
    this.level = 0; // how many 'stronger' steps the hole has taken (set by the scene from the run's height)
  }

  // pull multiplier at a level (the last table entry holds for deeper levels)
  static strengthAt(level) {
    const S = CFG.phantomZone.strength;
    return S[Math.min(Math.max(0, level), S.length - 1)];
  }

  get strength() {
    return GravityWell.strengthAt(this.level);
  }

  step(dt) {
    const P = CFG.phantomZone;
    this.t += dt;
    switch (this.phase) {
      case 'calm':
        this.k = Math.max(0, this.k - dt * 3);
        if (this.t >= this.wait) this.go('warn');
        break;
      case 'warn':
        this.warn = Math.min(1, this.t / P.warnS);
        if (this.t >= P.warnS) this.go('pull');
        break;
      case 'pull': {
        const up = Math.min(1, this.t / P.rampInS);
        const down = Math.min(1, (P.pullS - this.t) / P.rampOutS);
        this.k = Math.max(0, Math.min(up, down));
        if (this.t >= P.pullS) this.go('calm');
        break;
      }
    }
    this.vx = this.phase === 'pull' ? this.side * P.maxVx * this.strength * this.k : 0;
  }

  go(phase) {
    const P = CFG.phantomZone;
    this.phase = phase;
    this.t = 0;
    if (phase === 'warn') this.warn = 0;
    if (phase === 'calm') {
      this.cycles++;
      this.side = -this.side; // next time the hole drifts to the other side
      this.warn = 0;
      const f = Math.max(P.calmMin, Math.pow(P.calmShrink, Math.max(0, this.level - 1)));
      this.wait = (P.calmS[0] + this.rng() * (P.calmS[1] - P.calmS[0])) * f;
    }
  }

  // how far an untouched alien would drift during one full pull (px), for tests and tuning
  static maxDrift(level = 0) {
    const P = CFG.phantomZone;
    return P.maxVx * GravityWell.strengthAt(level) * (P.pullS - P.rampInS / 2 - P.rampOutS / 2);
  }
}
