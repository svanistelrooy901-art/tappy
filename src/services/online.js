// Online: the ONLY place the game talks to the leaderboard server (identity, seeds, score submission, board).
// Two interchangeable backends: HTTP (the real Cloudflare Worker in /server) and a MOCK that lives on the device,
// so the whole V1.1 flow can be built and tried before a server exists. Both speak the same shapes and error codes.
import { CFG } from '../config.js';
import { Save } from './save.js';
import { replayRun } from '../core/runsim.js';
import { checkNickname, isCountry } from '../../server/src/validate.js';

const SEED_FRESH_S = 5.5 * 3600; // use seeds before the server's 6 h expiry
const nowS = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------- HTTP backend
const HttpBackend = {
  kind: 'http',
  async call(method, path, { body, token } = {}) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), CFG.api.timeoutMs);
    try {
      const res = await fetch(CFG.api.url.replace(/\/$/, '') + path, {
        method,
        signal: ctl.signal,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, ...(await res.json().catch(() => ({}))) };
    } catch {
      return { status: 0, error: 'network' };
    } finally {
      clearTimeout(to);
    }
  },
  register: (nickname, country) => HttpBackend.call('POST', '/v1/register', { body: { nickname, country } }),
  recover: (code) => HttpBackend.call('POST', '/v1/recover', { body: { code } }),
  nick: (nick) => HttpBackend.call('GET', '/v1/nick-available?nick=' + encodeURIComponent(nick)),
  seeds: (token) => HttpBackend.call('POST', '/v1/seeds', { token }),
  score: (token, replay, seedToken) => HttpBackend.call('POST', '/v1/score', { token, body: { replay, seedToken } }),
  board: (token, limit, offset) => HttpBackend.call('GET', `/v1/leaderboard?limit=${limit}&offset=${offset}`, { token }),
};

// ---------------------------------------------------------------- MOCK backend (on-device, for building and testing)
const MOCK_KEY = 'tappy.mock';
const RIVALS = [
  ['AstroKid', 'MY', 1620], ['SiComel', 'MY', 1490], ['NovaRider', 'SG', 1330], ['KakAmin', 'MY', 1210], ['Luna_88', 'ID', 1130],
  ['PenangBoy', 'MY', 1040], ['GalaxyAli', 'MY', 960], ['Wira', 'BN', 880], ['MoonWalker', 'TH', 820], ['ComelPotato', 'MY', 760],
  ['TapMaster', 'SG', 690], ['Nasi.Lemak', 'MY', 610], ['StarDust', 'ID', 540], ['Budi_ID', 'ID', 470], ['KucingAngkasa', 'MY', 410],
  ['OrbitCat', 'PH', 350], ['ZigZag', 'MY', 300], ['Pixel_Pak', 'MY', 250], ['Aiman', 'MY', 200], ['TinyAlien', 'SG', 150],
];
const mockDb = () => {
  try {
    const d = JSON.parse(localStorage.getItem(MOCK_KEY));
    if (d?.players) return d;
  } catch {}
  return { players: {}, used: [] };
};
const mockSave = (d) => { try { localStorage.setItem(MOCK_KEY, JSON.stringify(d)); } catch {} };
const rnd = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
const CODE_ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const mockCode = () => {
  const c = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => CODE_ALPHA[b % CODE_ALPHA.length]).join('');
  return `TAPPY-${c(4)}-${c(4)}`;
};

const MockBackend = {
  kind: 'mock',
  async register(nickname, country) {
    const n = checkNickname(nickname);
    if (!n.ok) return { status: 400, error: n.reason };
    if (!isCountry(country)) return { status: 400, error: 'country' };
    const db = mockDb();
    const taken = RIVALS.some(([r]) => checkNickname(r).key === n.key) || Object.values(db.players).some((p) => p.key === n.key);
    if (taken) return { status: 409, error: 'nick_taken' };
    const id = rnd(8), secret = rnd(24), code = mockCode();
    db.players[id] = { id, nick: n.nick, key: n.key, country, secret, code, best: 0, bestAt: 0 };
    mockSave(db);
    return { status: 200, playerId: id, token: `${id}.${secret}`, recoveryCode: code, nickname: n.nick, country };
  },
  async recover(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = /^TAPPY([A-Z0-9]{8})$/.exec(c);
    if (!m) return { status: 400, error: 'code_format' };
    const full = `TAPPY-${m[1].slice(0, 4)}-${m[1].slice(4)}`;
    const db = mockDb();
    const p = Object.values(db.players).find((x) => x.code === full);
    if (!p) return { status: 404, error: 'code_unknown' };
    p.secret = rnd(24);
    mockSave(db);
    return { status: 200, playerId: p.id, token: `${p.id}.${p.secret}`, nickname: p.nick, country: p.country, bestM: p.best };
  },
  async nick(nick) {
    const n = checkNickname(nick);
    if (!n.ok) return { status: 200, available: false, reason: n.reason };
    const db = mockDb();
    const taken = RIVALS.some(([r]) => checkNickname(r).key === n.key) || Object.values(db.players).some((p) => p.key === n.key);
    return { status: 200, available: !taken, reason: taken ? 'nick_taken' : null };
  },
  who(token) {
    const [id, secret] = String(token || '').split('.');
    const db = mockDb();
    const p = db.players[id];
    return p && p.secret === secret ? { db, p } : null;
  },
  async seeds(token) {
    if (!this.who(token)) return { status: 401, error: 'unauthorised' };
    const iat = nowS();
    return { status: 200, seeds: Array.from({ length: 5 }, () => { const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; return { seed, token: `${rnd(6)}.${seed}.${iat}.mock` }; }), ttlS: 6 * 3600 };
  },
  async score(token, replay, seedToken) {
    const w = this.who(token);
    if (!w) return { status: 401, error: 'unauthorised' };
    const m = /^([0-9a-f]{12})\.(\d+)\.(\d+)\.mock$/.exec(String(seedToken));
    if (!m || replay?.seed !== Number(m[2])) return { status: 400, error: 'seed_invalid' };
    if (w.db.used.includes(m[1])) return { status: 409, error: 'seed_used' };
    const r = replayRun(replay);
    if (!r.ok) return { status: 422, error: 'replay_' + r.reason };
    w.db.used.push(m[1]);
    w.db.used = w.db.used.slice(-200);
    const t = nowS();
    const newBest = r.heightM > w.p.best;
    if (newBest) { w.p.best = r.heightM; w.p.bestAt = t; }
    mockSave(w.db);
    const rank = this.ranked(w.db).findIndex((e) => e.id === w.p.id) + 1;
    return { status: 200, accepted: true, heightM: r.heightM, coins: r.coins, newBest, bestM: w.p.best, rank };
  },
  ranked(db) {
    const all = RIVALS.map(([nick, country, h], i) => ({ id: 'r' + i, nickname: nick, country, heightM: h, at: 0 }));
    for (const p of Object.values(db.players)) if (p.best > 0) all.push({ id: p.id, nickname: p.nick, country: p.country, heightM: p.best, at: p.bestAt });
    return all.sort((a, b) => b.heightM - a.heightM || a.at - b.at);
  },
  async board(token, limit, offset) {
    const db = mockDb();
    const all = this.ranked(db);
    const at = (n) => all[n - 1]?.heightM ?? null;
    const out = { status: 200, entries: all.slice(offset, offset + limit).map((e, i) => ({ rank: offset + i + 1, nickname: e.nickname, country: e.country, heightM: e.heightM })), total: all.length, thresholds: { top1: at(1), top5: at(5), top10: at(10) } };
    const w = this.who(token);
    if (w) out.me = { nickname: w.p.nick, country: w.p.country, heightM: w.p.best, rank: w.p.best > 0 ? all.findIndex((e) => e.id === w.p.id) + 1 : null };
    return out;
  },
};

// ---------------------------------------------------------------- the service the game uses
export const Online = {
  get backend() {
    return CFG.api.url ? HttpBackend : MockBackend;
  },
  get isMock() {
    return !CFG.api.url;
  },
  get profile() {
    return Save.data.profile;
  },
  thresholds: null, // { top1, top5, top10 } from the latest board fetch (null = unknown / offline)
  _busy: { seeds: false, flush: false },

  async checkNick(nick) {
    const local = checkNickname(nick);
    if (!local.ok) return { ok: false, reason: local.reason };
    const r = await this.backend.nick(nick);
    if (r.status === 0) return { ok: true, available: null, reason: 'offline' }; // cannot tell; the server decides on submit
    return { ok: true, available: !!r.available, reason: r.reason || null };
  },

  async register(nickname, country) {
    const r = await this.backend.register(nickname, country);
    if (r.status !== 200) return { ok: false, error: r.error || 'failed' };
    Save.data.profile = { playerId: r.playerId, token: r.token, nickname: r.nickname, country: r.country, recoveryCode: r.recoveryCode };
    Save.data.seeds = [];
    Save.flush();
    this.prefetchSeeds();
    return { ok: true, profile: Save.data.profile };
  },

  async recover(code) {
    const r = await this.backend.recover(code);
    if (r.status !== 200) return { ok: false, error: r.error || 'failed' };
    Save.data.profile = { playerId: r.playerId, token: r.token, nickname: r.nickname, country: r.country, recoveryCode: String(code).toUpperCase() };
    Save.data.seeds = [];
    if (r.bestM > Save.data.best) Save.data.best = r.bestM;
    Save.flush();
    this.prefetchSeeds();
    return { ok: true, profile: Save.data.profile };
  },

  // ---- seeds: ranked runs use a server seed; everything else is an ordinary local run
  async prefetchSeeds() {
    const p = this.profile;
    if (!p || this._busy.seeds) return;
    Save.data.seeds = Save.data.seeds.filter((s) => nowS() - Number(s.token.split('.')[2]) < SEED_FRESH_S);
    if (Save.data.seeds.length >= 3) return;
    this._busy.seeds = true;
    try {
      const r = await this.backend.seeds(p.token);
      if (r.status === 200) {
        Save.data.seeds.push(...r.seeds.map((s) => ({ seed: s.seed, token: s.token })));
        Save.data.seeds = Save.data.seeds.slice(0, 10);
        Save.flush();
      }
    } finally {
      this._busy.seeds = false;
    }
  },

  // -> { seed, token } or null (not registered, or no seed cached: play an unranked local run)
  takeSeed() {
    if (!this.profile) return null;
    const fresh = (s) => nowS() - Number(s.token.split('.')[2]) < SEED_FRESH_S;
    while (Save.data.seeds.length) {
      const s = Save.data.seeds.shift();
      if (fresh(s)) {
        Save.flush();
        this.prefetchSeeds();
        return s;
      }
    }
    Save.flush();
    this.prefetchSeeds();
    return null;
  },

  // ---- scores: queued on the device first, so a closed app or a dead connection never loses a finished run
  async submit(replay, seedToken) {
    if (!this.profile || !seedToken) return null;
    Save.data.pending.push({ replay, seedToken });
    Save.data.pending = Save.data.pending.slice(-5);
    Save.flush();
    return this.flush();
  },

  // send queued runs, oldest first. Returns the result of the newest one that got an answer.
  async flush() {
    const p = this.profile;
    if (!p || this._busy.flush) return null;
    this._busy.flush = true;
    let last = null;
    try {
      while (Save.data.pending.length) {
        const job = Save.data.pending[0];
        const r = await this.backend.score(p.token, job.replay, job.seedToken);
        if (r.status === 0 || r.status >= 500 || r.status === 429) break; // try again later
        Save.data.pending.shift(); // accepted, or definitively rejected: either way do not resend
        Save.flush();
        if (r.accepted) last = r;
      }
    } finally {
      this._busy.flush = false;
    }
    return last;
  },

  // ---- board
  async board(limit = 12, offset = 0) {
    const r = await this.backend.board(this.profile?.token, limit, offset);
    if (r.status !== 200) return { ok: false, error: r.error || 'network' };
    if (r.thresholds) this.thresholds = r.thresholds;
    return { ok: true, entries: r.entries, me: r.me || null, thresholds: r.thresholds, total: r.total };
  },

  async refreshThresholds() {
    const r = await this.board(1, 0);
    if (!r.ok) this.thresholds = null;
    return this.thresholds;
  },

  // Which milestone revive (if any) fits a run that died at heightM? Lowest unused milestone it is within 90% of (but below).
  milestoneOffer(run) {
    const t = this.thresholds;
    if (!t || !this.profile) return null;
    const h = run.maxHeightM;
    for (const [kind, label] of [['top10', 'Top 10'], ['top5', 'Top 5'], ['top1', '#1']]) {
      const need = t[kind];
      if (need == null || run.competitiveReviveUsed[kind]) continue;
      if (h < need && h >= need * CFG.competitiveRevive.nearPct) return { kind, label, need };
    }
    return null;
  },
};

// ---------------------------------------------------------------- country list for the join form
export function countryList() {
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const list = [];
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (isCountry(code)) list.push({ code, name: names.of(code), flag: flagOf(code) });
  }
  const first = ['MY', 'SG', 'ID', 'BN', 'TH'];
  list.sort((x, y) => (first.indexOf(x.code) + 1 || 99) - (first.indexOf(y.code) + 1 || 99) || x.name.localeCompare(y.name));
  return list;
}
export const flagOf = (code) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
