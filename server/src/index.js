import { replayRun } from '../../src/core/runsim.js';
import { CFG } from '../../src/config.js';
import { checkNickname, isCountry } from './validate.js';
import { skeleton } from './profanity.js';
import { sha256, randomHex, newRecoveryCode, normaliseRecovery, hmac, safeEqual } from './crypto.js';

// Tappy leaderboard API (Cloudflare Worker + D1). `handle(request, env)` is plain Web-standard code, so it runs
// the same in a Worker, in `wrangler dev` and in the Node tests (with a D1 stand-in).
//
// env.DB          D1 database
// env.SEED_SECRET HMAC key for run seeds (set with `wrangler secret put SEED_SECRET`)
// env.ADMIN_KEY   bearer key for /v1/admin/* (set with `wrangler secret put ADMIN_KEY`); admin routes are off without it

const SEED_TTL_S = 6 * 3600;
const SEEDS_PER_CALL = 5;
const MIN_TAP_GAP_TICKS = 4; // 4 ticks = 33 ms: no human taps faster
const MAX_BODY = 150_000; // bytes
const DT = CFG.physics.step;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', ...extra },
  });
const fail = (error, status = 400, more = {}) => json({ error, ...more }, status);
const now = () => Math.floor(Date.now() / 1000);

async function body(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error('too_large'), { status: 413 });
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('bad_json'), { status: 400 });
  }
}

// ---------------------------------------------------------------- rate limit (fixed window, per key)
async function allow(env, key, max, windowS) {
  const w = Math.floor(now() / windowS);
  const row = await env.DB.prepare('INSERT INTO rate (k, w, n) VALUES (?, ?, 1) ON CONFLICT (k, w) DO UPDATE SET n = n + 1 RETURNING n').bind(key, w).first();
  if (Math.random() < 0.01) await env.DB.prepare('DELETE FROM rate WHERE w < ?').bind(w - 2).run().catch(() => {});
  return row.n <= max;
}
const ipOf = (request) => request.headers.get('cf-connecting-ip') || 'local';

// ---------------------------------------------------------------- auth: "Authorization: Bearer <playerId>.<secret>"
async function authPlayer(request, env) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer ([0-9a-f]{16})\.([0-9a-f]{48})$/.exec(h);
  if (!m) return null;
  const p = await env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(m[1]).first();
  if (!p) return null;
  return safeEqual(p.token_hash, await sha256(m[2])) ? p : null;
}

const rankOf = (env, best, at) =>
  env.DB.prepare('SELECT COUNT(*) + 1 AS r FROM players WHERE hidden = 0 AND (best_m > ? OR (best_m = ? AND best_at < ?))').bind(best, best, at ?? 0).first().then((r) => r.r);

// ---------------------------------------------------------------- routes
async function register(request, env) {
  if (!(await allow(env, 'reg:' + ipOf(request), 10, 3600))) return fail('rate_limited', 429);
  const b = await body(request);
  const n = checkNickname(b.nickname);
  if (!n.ok) return fail(n.reason);
  if (!isCountry(b.country)) return fail('country');
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomHex(8);
    const secret = randomHex(24);
    const code = newRecoveryCode();
    try {
      await env.DB.prepare('INSERT INTO players (id, nick, nick_key, country, token_hash, recovery_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, n.nick, n.key, b.country, await sha256(secret), await sha256(code), now())
        .run();
      return json({ playerId: id, token: `${id}.${secret}`, recoveryCode: code, nickname: n.nick, country: b.country });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('nick_key')) return fail('nick_taken', 409);
      if (msg.includes('recovery_hash') || msg.includes('players.id')) continue; // astronomically rare: draw again
      throw e;
    }
  }
  return fail('try_again', 503);
}

async function nickAvailable(request, env) {
  if (!(await allow(env, 'nick:' + ipOf(request), 60, 3600))) return fail('rate_limited', 429);
  const nick = new URL(request.url).searchParams.get('nick');
  const n = checkNickname(nick);
  if (!n.ok) return json({ available: false, reason: n.reason });
  const row = await env.DB.prepare('SELECT 1 AS x FROM players WHERE nick_key = ?').bind(n.key).first();
  return json({ available: !row, reason: row ? 'nick_taken' : null });
}

async function recover(request, env) {
  if (!(await allow(env, 'rec:' + ipOf(request), 8, 3600))) return fail('rate_limited', 429);
  const b = await body(request);
  const code = normaliseRecovery(b.code);
  if (!code) return fail('code_format');
  const p = await env.DB.prepare('SELECT * FROM players WHERE recovery_hash = ?').bind(await sha256(code)).first();
  if (!p) return fail('code_unknown', 404);
  // the old phone's token stops working: one active device per identity
  const secret = randomHex(24);
  await env.DB.prepare('UPDATE players SET token_hash = ? WHERE id = ?').bind(await sha256(secret), p.id).run();
  return json({ playerId: p.id, token: `${p.id}.${secret}`, nickname: p.nick, country: p.country, bestM: p.best_m });
}

// Server-issued seeds: stateless (HMAC) and bound to the player, valid for 6 h, one run each.
// Why: a player cannot shop for an easy world or fast-forward a run offline; a run's length must fit the time since its seed was issued.
async function seeds(request, env, player) {
  if (!(await allow(env, 'seeds:' + player.id, 30, 3600))) return fail('rate_limited', 429);
  const out = [];
  const iat = now();
  for (let i = 0; i < SEEDS_PER_CALL; i++) {
    const id = randomHex(6);
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1; // 31-bit, like the game's own seeds
    const sig = (await hmac(env.SEED_SECRET, `${id}.${seed}.${iat}.${player.id}`)).slice(0, 32);
    out.push({ seed, token: `${id}.${seed}.${iat}.${sig}` });
  }
  return json({ seeds: out, ttlS: SEED_TTL_S });
}

async function openSeed(env, player, token) {
  const m = /^([0-9a-f]{12})\.(\d{1,10})\.(\d{9,11})\.([0-9a-f]{32})$/.exec(String(token || ''));
  if (!m) return null;
  const [, id, seed, iat, sig] = m;
  const want = (await hmac(env.SEED_SECRET, `${id}.${seed}.${iat}.${player.id}`)).slice(0, 32);
  if (!safeEqual(sig, want)) return null;
  return { id, seed: Number(seed), iat: Number(iat) };
}

async function submitScore(request, env, player) {
  if (!(await allow(env, 'score:' + player.id, 60, 3600))) return fail('rate_limited', 429);
  const b = await body(request);
  const s = await openSeed(env, player, b.seedToken);
  if (!s) return fail('seed_invalid');
  const t = now();
  if (t - s.iat > SEED_TTL_S) return fail('seed_expired');
  const rec = b.replay;
  if (!rec || rec.seed !== s.seed) return fail('seed_mismatch');
  if (!Array.isArray(rec.taps) || !Array.isArray(rec.revives) || rec.revives.length > 5) return fail('replay_format');

  // plausibility, cheap checks first
  for (let i = 1; i < rec.taps.length; i++) if (Math.floor(rec.taps[i] / 3) - Math.floor(rec.taps[i - 1] / 3) < MIN_TAP_GAP_TICKS) return fail('tap_rate');
  if (!Number.isInteger(rec.ticks) || rec.ticks < 1) return fail('replay_format');
  // a run cannot have been played faster than real time since its seed was issued (2 s of slack for clock skew)
  if (rec.ticks * DT > t - s.iat + 2) return fail('too_fast');

  const r = replayRun(rec);
  if (!r.ok) return fail('replay_' + r.reason, 422);
  if (r.ticks !== rec.ticks) return fail('replay_mismatch', 422);

  // burn the seed (one run per seed); a second submission of the same run loses the race here
  try {
    await env.DB.prepare('INSERT INTO used_seeds (seed_id, used_at) VALUES (?, ?)').bind(s.id, t).run();
  } catch {
    return fail('seed_used', 409);
  }
  const newBest = r.heightM > player.best_m;
  const stmts = [env.DB.prepare('INSERT INTO runs (player_id, height_m, coins, ticks, taps, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(player.id, r.heightM, r.coins, r.ticks, r.taps, t)];
  if (newBest) stmts.push(env.DB.prepare('UPDATE players SET best_m = ?, best_at = ?, best_replay = ? WHERE id = ?').bind(r.heightM, t, JSON.stringify(rec), player.id));
  await env.DB.batch(stmts);
  const bestM = newBest ? r.heightM : player.best_m;
  const bestAt = newBest ? t : player.best_at;
  return json({ accepted: true, heightM: r.heightM, coins: r.coins, newBest, bestM, rank: player.hidden ? null : await rankOf(env, bestM, bestAt) });
}

async function leaderboard(request, env) {
  const u = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(u.searchParams.get('offset')) || 0);
  const me = await authPlayer(request, env);
  const rows = await env.DB.prepare(
    `SELECT rank, nick, country, best_m FROM (
       SELECT ROW_NUMBER() OVER (ORDER BY best_m DESC, best_at ASC) AS rank, nick, country, best_m
       FROM players WHERE hidden = 0 AND best_m > 0
     ) WHERE rank > ? AND rank <= ? ORDER BY rank`
  ).bind(offset, offset + limit).all();
  const th = await env.DB.prepare('SELECT rank, best_m FROM (SELECT ROW_NUMBER() OVER (ORDER BY best_m DESC, best_at ASC) AS rank, best_m FROM players WHERE hidden = 0 AND best_m > 0) WHERE rank IN (1, 5, 10)').all();
  const at = (n) => th.results.find((x) => x.rank === n)?.best_m ?? null;
  const out = {
    entries: rows.results.map((r) => ({ rank: r.rank, nickname: r.nick, country: r.country, heightM: r.best_m })),
    // heights needed to reach each milestone (null until the board has that many players)
    thresholds: { top1: at(1), top5: at(5), top10: at(10) },
  };
  if (me) out.me = { nickname: me.nick, country: me.country, heightM: me.best_m, rank: me.best_m > 0 && !me.hidden ? await rankOf(env, me.best_m, me.best_at) : null };
  return json(out, 200, me ? {} : { 'cache-control': 'public, max-age=15' });
}

// ---------------------------------------------------------------- admin (the only way a nickname ever changes)
async function admin(request, env, path) {
  if (!env.ADMIN_KEY) return fail('not_found', 404);
  const h = request.headers.get('authorization') || '';
  if (!safeEqual(h, `Bearer ${env.ADMIN_KEY}`)) return fail('forbidden', 403);
  const b = await body(request);
  const find = () => env.DB.prepare('SELECT * FROM players WHERE id = ? OR nick_key = ?').bind(String(b.player), skeleton(String(b.player))).first();
  if (path === '/v1/admin/rename') {
    const p = await find();
    if (!p) return fail('player_unknown', 404);
    const n = checkNickname(b.nickname);
    if (!n.ok) return fail(n.reason);
    try {
      await env.DB.prepare('UPDATE players SET nick = ?, nick_key = ? WHERE id = ?').bind(n.nick, n.key, p.id).run();
    } catch {
      return fail('nick_taken', 409);
    }
    return json({ ok: true, playerId: p.id, was: p.nick, now: n.nick });
  }
  if (path === '/v1/admin/hide') {
    const p = await find();
    if (!p) return fail('player_unknown', 404);
    await env.DB.prepare('UPDATE players SET hidden = ? WHERE id = ?').bind(b.hidden ? 1 : 0, p.id).run();
    return json({ ok: true, playerId: p.id, hidden: !!b.hidden });
  }
  return fail('not_found', 404);
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return json({}, 204);
  try {
    if (path === '/v1/health') return json({ ok: true });
    if (request.method === 'GET' && path === '/v1/leaderboard') return await leaderboard(request, env);
    if (request.method === 'GET' && path === '/v1/nick-available') return await nickAvailable(request, env);
    if (request.method === 'POST' && path === '/v1/register') return await register(request, env);
    if (request.method === 'POST' && path === '/v1/recover') return await recover(request, env);
    if (path.startsWith('/v1/admin/') && request.method === 'POST') return await admin(request, env, path);
    if (request.method === 'POST' && (path === '/v1/seeds' || path === '/v1/score')) {
      const player = await authPlayer(request, env);
      if (!player) return fail('unauthorised', 401);
      return path === '/v1/seeds' ? await seeds(request, env, player) : await submitScore(request, env, player);
    }
    return fail('not_found', 404);
  } catch (e) {
    if (e?.status) return fail(e.message, e.status);
    console.error('unhandled', e);
    return fail('server_error', 500);
  }
}

export default { fetch: (request, env) => handle(request, env) };
