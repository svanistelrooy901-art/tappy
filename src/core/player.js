import { CFG } from '../config.js';

export const S = {
  SPAWN: 'SPAWN',
  RESTING: 'RESTING',
  JUMPING: 'JUMPING',
  FALLING: 'FALLING',
  HIT_STUN: 'HIT_STUN',
  DEAD: 'DEAD',
  REVIVING: 'REVIVING',
};

// Explicit transition table. Anything not listed is rejected, never silently inferred.
// A tap while JUMPING is an air jump: same state, new impulse (no transition needed).
const ALLOWED = {
  SPAWN: ['RESTING', 'JUMPING', 'FALLING', 'DEAD'],
  RESTING: ['JUMPING', 'HIT_STUN', 'DEAD'],
  JUMPING: ['FALLING', 'HIT_STUN', 'DEAD'],
  FALLING: ['RESTING', 'JUMPING', 'HIT_STUN', 'DEAD'],
  HIT_STUN: ['RESTING', 'JUMPING', 'FALLING', 'DEAD'],
  DEAD: ['SPAWN', 'REVIVING'],
  REVIVING: ['RESTING', 'JUMPING', 'FALLING', 'DEAD'],
};

const { gravity: G, jumpVy: V, lateralVx: LX, maxFall, landTol, stunSeconds, stunTapAfter } = CFG.physics;
const PL = CFG.player;

// Pure gameplay body: no Phaser, so it can be unit-tested headlessly.
export class PlayerBody {
  constructor(cb = {}) {
    this.cb = cb;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.state = S.DEAD;
    this.platform = null;
    this.invuln = 0;
    this.stateT = 0;
    this.lastDir = 0;
    this.pullVx = 0; // sideways pull from the Phantom Zone black hole (px/s), set by the scene each step; airborne only
  }

  get alive() {
    return this.state !== S.DEAD;
  }
  get airborne() {
    return this.state === S.JUMPING || this.state === S.FALLING || this.state === S.HIT_STUN;
  }
  get vulnerable() {
    return this.invuln <= 0 && (this.state === S.RESTING || this.airborne);
  }
  // Can a tap make the alien jump right now? (never when dead, never without a tap)
  get canJump() {
    switch (this.state) {
      case S.RESTING:
      case S.JUMPING:
      case S.FALLING:
      case S.SPAWN:
      case S.REVIVING:
        return true;
      case S.HIT_STUN:
        return this.stateT >= stunTapAfter;
      default:
        return false;
    }
  }

  transition(to) {
    if (this.state === to) return true;
    if (!ALLOWED[this.state].includes(to)) {
      this.cb.onBadTransition?.(this.state, to);
      return false;
    }
    const from = this.state;
    this.state = to;
    this.stateT = 0;
    this.cb.onState?.(from, to);
    return true;
  }

  // target: a platform {x,y,w} to stand on, or a mid-air point {x,y,air:true} (y = body centre).
  spawnAt(target, kind = S.SPAWN, protect = CFG.spawnProtect) {
    this.state = S.DEAD; // always legal to come back from DEAD
    this.transition(kind);
    this.x = target.x;
    this.vx = this.vy = 0;
    if (target.air) {
      this.platform = null;
      this.y = target.y;
    } else {
      this.platform = target;
      this.y = target.y - PL.feet;
    }
    this.invuln = protect;
    this.stateT = 0;
  }

  // A tap. Works on the ground and in the air, as often as the player taps.
  requestJump(dir) {
    if (!this.canJump) return false;
    this.jump(dir);
    return true;
  }

  jump(dir) {
    const fromGround = this.state === S.RESTING || (this.platform !== null && (this.state === S.SPAWN || this.state === S.REVIVING));
    this.vy = -V;
    this.vx = dir * LX;
    this.lastDir = dir;
    this.platform = null;
    this.transition(S.JUMPING);
    this.cb.onJump?.(dir, fromGround);
  }

  applyHit(fromX) {
    if (!this.vulnerable) return false;
    this.transition(S.HIT_STUN);
    this.vy = -300;
    this.vx = this.x >= fromX ? 90 : -90;
    this.platform = null;
    this.invuln = CFG.invulnSeconds;
    return true;
  }

  kill() {
    if (this.state === S.DEAD) return;
    this.transition(S.DEAD);
    this.vx = 0;
    this.vy = -380;
    this.platform = null;
  }

  step(dt, platforms) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.stateT += dt;

    switch (this.state) {
      case S.SPAWN:
      case S.REVIVING:
        if (this.platform) {
          if (this.stateT >= 0.35) this.transition(S.RESTING);
        } else if (this.stateT >= CFG.airSpawnHold) {
          this.transition(S.FALLING); // hover over, gravity takes back over (no auto-jump)
        }
        return;
      case S.RESTING:
        return;
      case S.DEAD:
        this.vy = Math.min(this.vy + G * dt, maxFall);
        this.y += this.vy * dt;
        return;
    }

    // airborne integration
    const prevFeet = this.y + PL.feet;
    const vy0 = this.vy;
    this.vy = Math.min(vy0 + G * dt, maxFall);
    this.x += (this.vx + this.pullVx) * dt;
    this.y += ((vy0 + this.vy) / 2) * dt; // trapezoid: exact for constant gravity
    if (this.x < PL.halfW) {
      this.x = PL.halfW;
      this.vx = 0;
    } else if (this.x > CFG.W - PL.halfW) {
      this.x = CFG.W - PL.halfW;
      this.vx = 0;
    }
    if (this.state === S.JUMPING && this.vy > 0) this.transition(S.FALLING);
    if (this.state === S.HIT_STUN && this.stateT >= stunSeconds) this.transition(this.vy < 0 ? S.JUMPING : S.FALLING);

    if (this.vy > 0) {
      const feet = this.y + PL.feet;
      let hit = null;
      for (const p of platforms) {
        if (prevFeet <= p.y + 10 && feet >= p.y && Math.abs(this.x - p.x) <= p.w / 2 + landTol) {
          if (!hit || p.y < hit.y) hit = p;
        }
      }
      if (hit) this.land(hit);
    }
  }

  land(p) {
    const impact = this.vy;
    this.y = p.y - PL.feet;
    this.vx = this.vy = 0;
    this.platform = p;
    this.transition(S.RESTING);
    this.cb.onLand?.(p, impact);
  }
}
