import { CFG } from '../config.js';

function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {}
  return 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// One run's state. A revive never creates a new run id.
export class RunState {
  constructor(seed) {
    this.id = uuid();
    this.seed = seed >>> 0;
    this.lives = CFG.lives;
    this.maxHeightM = 0;
    this.coins = 0;
    this.normalReviveUsed = false;
    this.redZoneShown = false; // the RED ZONE banner plays once per run
    this.blackZoneShown = false; // likewise for the BLACK ZONE banner
    this.phantomZoneShown = false;
    this.phantomLevelShown = 0; // highest hole-strength level already announced // the PHANTOM ZONE banner plays once per run
    this.coinFrac = 0; // leftover fraction of a coin (Red Zone pays 1.5x)
    this.coinReviveUsed = false; // paid with coins; offered only after the ad revive has been used
    // V1.1: competitive milestone revives (distinct entitlements, once per milestone per run)
    this.competitiveReviveUsed = { top10: false, top5: false, top1: false };
    this.startedAt = Date.now();
    this.endedAt = null;
    this.status = 'active'; // active | ended
  }

  addHeight(m) {
    if (m > this.maxHeightM) this.maxHeightM = m; // monotonic, never reset by life loss or revive
  }

  // Red Zone is entered once the run's best height reaches it, and then lasts for the rest of the run
  get inRedZone() {
    return this.maxHeightM >= CFG.redZone.fromM;
  }

  get inBlackZone() {
    return this.maxHeightM >= CFG.blackZone.fromM;
  }

  get inPhantomZone() {
    return this.maxHeightM >= CFG.phantomZone.fromM;
  }

  // 0 at the start of the Phantom Zone, +1 every CFG.phantomZone.levelM metres deeper (the black hole grows stronger)
  get phantomLevel() {
    const P = CFG.phantomZone;
    return this.inPhantomZone ? Math.floor((this.maxHeightM - P.fromM) / P.levelM) : 0;
  }

  // coin multiplier of the zone the run has reached: 1x, Red 1.5x, Black 2x, Phantom 3x
  get coinMult() {
    return this.inPhantomZone ? CFG.phantomZone.coinMult : this.inBlackZone ? CFG.blackZone.coinMult : this.inRedZone ? CFG.redZone.coinMult : 1;
  }

  // one coin pickup: whole coins are banked, any fraction is carried to the next pickup. Returns the whole coins added.
  addPickup() {
    const v = CFG.coinsPerPickup * this.coinMult + this.coinFrac;
    const w = Math.floor(v + 1e-9);
    this.coinFrac = Math.max(0, v - w);
    this.coins += w;
    return w;
  }

  get canNormalRevive() {
    return !this.normalReviveUsed;
  }

  get canCoinRevive() {
    return this.normalReviveUsed && !this.coinReviveUsed;
  }
}
