// Versioned, corruption-safe local save. Wallet commits are idempotent per run id.
import { SKIN_IDS, skinById } from '../data/cosmetics.js';

const KEY = 'tappy.save';

const DEFAULTS = () => ({
  v: 3,
  best: 0,
  wallet: 0,
  lastRunId: null,
  owned: ['default'],
  equipped: 'default',
  txIds: [],
  settings: { sound: true, haptics: true },
  profile: null, // V1.1 leaderboard identity: { playerId, token, nickname, country, recoveryCode }
  seeds: [], // server-issued run seeds [{ seed, token, iat }]
  pending: [], // finished runs waiting to be submitted [{ replay, seedToken }]
});

function migrate(d) {
  const base = DEFAULTS();
  if (!d || typeof d !== 'object') return base;
  // v1 saves have no cosmetics: they keep best/wallet and start with the default skin
  const owned = Array.isArray(d.owned) ? d.owned.filter((id) => SKIN_IDS.includes(id)) : [];
  if (!owned.includes('default')) owned.unshift('default');
  const equipped = owned.includes(d.equipped) ? d.equipped : 'default';
  return {
    v: 3,
    best: Number.isFinite(d.best) ? d.best : 0,
    wallet: Number.isFinite(d.wallet) ? d.wallet : 0,
    lastRunId: typeof d.lastRunId === 'string' ? d.lastRunId : null,
    owned: [...new Set(owned)],
    equipped,
    txIds: Array.isArray(d.txIds) ? d.txIds.filter((t) => typeof t === 'string').slice(-50) : [],
    settings: { ...base.settings, ...(d.settings || {}) },
    profile: d.profile && typeof d.profile.token === 'string' && typeof d.profile.nickname === 'string' ? { playerId: String(d.profile.playerId), token: d.profile.token, nickname: d.profile.nickname, country: String(d.profile.country), recoveryCode: String(d.profile.recoveryCode || '') } : null,
    seeds: Array.isArray(d.seeds) ? d.seeds.filter((x) => x && Number.isInteger(x.seed) && typeof x.token === 'string').slice(0, 10) : [],
    pending: Array.isArray(d.pending) ? d.pending.filter((x) => x && x.replay && typeof x.seedToken === 'string').slice(0, 5) : [],
  };
}

export const Save = {
  data: DEFAULTS(),

  load() {
    // main copy first; if it is missing or corrupt, fall back to the previous backup copy
    for (const k of [KEY, KEY + '.bak']) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          this.data = migrate(JSON.parse(raw));
          return this.data;
        }
      } catch {}
    }
    this.data = DEFAULTS();
    return this.data;
  },

  flush() {
    try {
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(KEY + '.bak', prev);
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {}
  },

  // Returns { newBest } or null if this run was already committed.
  commitRun(run) {
    if (this.data.lastRunId === run.id) return null;
    this.data.lastRunId = run.id;
    this.data.wallet += run.coins;
    const m = Math.floor(run.maxHeightM);
    const newBest = m > this.data.best;
    if (newBest) this.data.best = m;
    this.flush();
    return { newBest };
  },

  // Coin revive: once per run, only after the ad revive. Pays from this run's coins first, then the wallet.
  // Charges nothing and returns ok:false if it is not allowed or not affordable. Safe to call twice.
  spendOnRevive(run, cost) {
    if (!run.canCoinRevive) return { ok: false, reason: 'unavailable' };
    const total = this.data.wallet + run.coins;
    if (total < cost) return { ok: false, reason: 'funds', missing: cost - total };
    const fromRun = Math.min(run.coins, cost);
    run.coins -= fromRun;
    this.data.wallet -= cost - fromRun;
    run.coinReviveUsed = true;
    this.flush();
    return { ok: true };
  },

  owns(id) {
    return this.data.owned.includes(id);
  },

  // Spend coins on a skin. Safe to call twice: an owned skin is never charged again.
  buySkin(id) {
    const skin = skinById(id);
    if (!skin) return { ok: false, reason: 'unknown' };
    if (this.owns(id)) return { ok: false, reason: 'owned' };
    const cost = skin.price.coins;
    if (this.data.wallet < cost) return { ok: false, reason: 'funds', missing: cost - this.data.wallet };
    this.data.wallet -= cost;
    this.data.owned.push(id);
    this.flush();
    return { ok: true };
  },

  // Ownership from a real-money purchase (no coins spent). Safe to call twice with the same transaction.
  grantSkin(id, txId) {
    if (!skinById(id)) return false;
    if (txId && this.data.txIds.includes(txId)) return true;
    if (txId) this.data.txIds.push(txId);
    if (!this.owns(id)) this.data.owned.push(id);
    this.flush();
    return true;
  },

  equip(id) {
    if (!this.owns(id)) return false;
    this.data.equipped = id;
    this.flush();
    return true;
  },
};
