import { handle } from '../src/index.js';
import { makeDB } from './d1shim.mjs';
import { RunSim } from '../../src/core/runsim.js';
import { S } from '../../src/core/player.js';
import { CFG } from '../../src/config.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const dt = CFG.physics.step, PL = CFG.player;

const env = { DB: makeDB(), SEED_SECRET: 'test-secret', ADMIN_KEY: 'admin-test-key' };
let clock = 1_800_000_000_000; // controllable "now" (ms)
Date.now = () => clock;
let ipN = 0;
const call = async (method, path, { body, token, ip } = {}) => {
  const headers = { 'cf-connecting-ip': ip || `10.0.${(ipN++ / 250) | 0}.${ipN % 250}` };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await handle(new Request('http://x' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
};
const reg = (nickname, country = 'MY', ip) => call('POST', '/v1/register', { body: { nickname, country }, ip });

// a pilot that plays a real run through the sim and returns the replay (quits recklessly at quitM so the run ends)
function play(seed, quitM = 300, pilotSeed = 1) {
  const sim = new RunSim(seed);
  let last = -9, g = 0, r = pilotSeed;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  while (!sim.over && g++ < 400000) {
    const b = sim.body;
    if (b.canJump && (b.state === S.RESTING || (b.vy > 120 && sim.simT - last > 0.14 + rnd() * 0.05))) {
      if (sim.run.maxHeightM >= quitM) sim.tap(0);
      else {
        const tx = sim.gen.corridorX(b.y - 80);
        const px = (d) => Math.min(CFG.W - PL.halfW, Math.max(PL.halfW, b.x + d * CFG.physics.lateralVx * 0.3));
        let best = 0;
        for (const d of [0, -1, 1]) if (Math.abs(px(d) - tx) < Math.abs(px(best) - tx) - 1) best = d;
        sim.tap(best);
      }
      last = sim.simT;
    }
    sim.step(dt);
  }
  return sim.exportReplay();
}
const getSeed = async (token) => (await call('POST', '/v1/seeds', { token })).seeds[0];
// issue a seed, "play" for the right amount of time (move the clock), submit
async function runAndSubmit(token, quitM, pilotSeed = 1) {
  const s = await getSeed(token);
  const replay = play(s.seed, quitM, pilotSeed);
  clock += Math.ceil(replay.ticks * dt + 5) * 1000;
  return { s, replay, res: await call('POST', '/v1/score', { token, body: { replay, seedToken: s.token } }) };
}

// ---- registration
const a = await reg('Mamu_MY');
ok(a.status === 200 && a.token && /^TAPPY-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(a.recoveryCode), 'register ok with a TAPPY-XXXX-XXXX recovery code: ' + JSON.stringify(a).slice(0, 120));
ok((await reg('mamu_my')).error === 'nick_taken', 'nickname unique, case-insensitive');
ok((await reg('M4mu_my')).error === 'nick_taken', 'look-alike digits count as the same name');
ok((await reg('Mamu_MY2')).status === 200, 'a different name with a suffix is fine');
for (const [n, e] of [['ab', 'nick_short'], ['abcdefghijklm', 'nick_long'], ['has space', 'nick_chars'], ['emoji😀ok', 'nick_chars'], ['12345', 'nick_chars'], ['fuck_you', 'nick_blocked'], ['f.u.c.k', 'nick_blocked'], ['5h1t', 'nick_blocked'], ['BabiGila', 'nick_blocked'], ['pukimak', 'nick_blocked'], ['Admin', 'nick_reserved'], ['Tappy', 'nick_reserved'], ['Hitler99', 'nick_blocked']]) {
  const r = await reg(n);
  ok(r.error === e, `"${n}" -> ${e} (got ${r.error || 'OK'})`);
}
for (const good of ['classic', 'Assistant', 'Cassie', 'Penang_Boy', 'KakAmin', 'SiComel', 'ArnabKu', 'Ali.Baba']) ok((await reg(good)).status === 200, `"${good}" is allowed`);
ok((await reg('GoodName', 'XX')).error === 'country' && (await reg('GoodName', 'EU')).error === 'country' && (await reg('GoodName', 'my')).error === 'country', 'invalid countries rejected');
ok((await reg('GoodName', 'SG')).status === 200, 'SG accepted');
ok((await call('GET', '/v1/nick-available?nick=Mamu_MY')).available === false && (await call('GET', '/v1/nick-available?nick=FreeName1')).available === true, 'nick-available endpoint');

// ---- recovery
{
  const b = await reg('Recoverer', 'ID');
  const wrong = await call('POST', '/v1/recover', { body: { code: 'TAPPY-AAAA-BBBB' } });
  ok(wrong.status === 404, 'unknown recovery code');
  ok((await call('POST', '/v1/recover', { body: { code: 'nonsense' } })).error === 'code_format', 'bad recovery code format');
  const back = await call('POST', '/v1/recover', { body: { code: b.recoveryCode.toLowerCase().replace(/-/g, ' ') } });
  ok(back.status === 200 && back.nickname === 'Recoverer' && back.country === 'ID' && back.playerId === b.playerId, 'recovery restores identity (forgiving about case and dashes)');
  ok((await call('POST', '/v1/seeds', { token: b.token })).status === 401, 'old phone token stops working after recovery');
  ok((await call('POST', '/v1/seeds', { token: back.token })).status === 200, 'new token works');
}
// recovery brute-force is rate limited per IP
{
  let last;
  for (let i = 0; i < 10; i++) last = await call('POST', '/v1/recover', { body: { code: 'TAPPY-AAAA-BBBB' }, ip: '9.9.9.9' });
  ok(last.status === 429, 'recovery attempts are rate limited');
}

// ---- seeds and scores
const p1 = await reg('Climber1', 'MY'), p2 = await reg('Climber2', 'SG'), p3 = await reg('Climber3', 'ID');
const r1 = await runAndSubmit(p1.token, 250, 1);
ok(r1.res.accepted && r1.res.heightM > 100 && r1.res.rank === 1 && r1.res.newBest, 'a genuine run is accepted: ' + JSON.stringify(r1.res));
ok((await call('POST', '/v1/score', { token: p1.token, body: { replay: r1.replay, seedToken: r1.s.token } })).error === 'seed_used', 'the same seed cannot be used twice');
ok((await call('POST', '/v1/score', { token: p2.token, body: { replay: r1.replay, seedToken: r1.s.token } })).error === 'seed_invalid', "another player cannot use someone else's seed");
{
  const s = await getSeed(p2.token);
  const rep = play(s.seed, 200, 2);
  clock += Math.ceil(rep.ticks * dt + 5) * 1000;
  const tampered = { ...rep, taps: rep.taps.filter((_, i) => i % 4 !== 1) };
  const t = await call('POST', '/v1/score', { token: p2.token, body: { replay: tampered, seedToken: s.token } });
  ok(!t.accepted && (t.error || '').startsWith('replay_'), 'an edited tap log is rejected: ' + t.error);
  const other = await call('POST', '/v1/score', { token: p2.token, body: { replay: { ...rep, seed: rep.seed + 1 }, seedToken: s.token } });
  ok(other.error === 'seed_mismatch', 'replay seed must match the issued seed');
  const forged = await call('POST', '/v1/score', { token: p2.token, body: { replay: rep, seedToken: s.token.slice(0, -1) + (s.token.endsWith('0') ? '1' : '0') } });
  ok(forged.error === 'seed_invalid', 'forged seed signature rejected');
  const good = await call('POST', '/v1/score', { token: p2.token, body: { replay: rep, seedToken: s.token } });
  ok(good.accepted, 'the untampered run is still accepted after failed attempts (a bad submission does not burn the seed)');
}
{
  const s = await getSeed(p3.token);
  const rep = play(s.seed, 200, 3);
  // submitted instantly: the run could not have been played yet
  const fast = await call('POST', '/v1/score', { token: p3.token, body: { replay: rep, seedToken: s.token } });
  ok(fast.error === 'too_fast', 'a long run submitted right after the seed was issued is rejected (offline fast-forward)');
  clock += 7 * 3600 * 1000;
  ok((await call('POST', '/v1/score', { token: p3.token, body: { replay: rep, seedToken: s.token } })).error === 'seed_expired', 'seeds expire after 6 hours');
}
{
  const s = await getSeed(p3.token);
  const rep = play(s.seed, 150, 4);
  clock += Math.ceil(rep.ticks * dt + 5) * 1000;
  const rapid = { ...rep, taps: rep.taps.map((t, i) => (i < 20 ? Math.floor(t / 3) * 3 + 1 : t)) }; // many taps on one tick
  const r = await call('POST', '/v1/score', { token: p3.token, body: { replay: { ...rep, taps: [3, 6, 9, 12, ...rep.taps.slice(4).filter((x) => x > 100)] }, seedToken: s.token } });
  ok(r.error === 'tap_rate', 'superhuman tap rate is rejected: ' + r.error);
  void rapid;
}
ok((await call('POST', '/v1/score', { body: {} })).status === 401, 'score needs a token');

// ---- leaderboard
{
  const q = await runAndSubmit(p3.token, 400, 5);
  const q2 = await runAndSubmit(p2.token, 500, 6);
  const lb = await call('GET', '/v1/leaderboard', { token: p3.token });
  ok(lb.entries.length >= 3, 'leaderboard lists players: ' + lb.entries.map((e) => `${e.rank}.${e.nickname}:${e.heightM}`).join(' '));
  ok(lb.entries.every((e, i) => i === 0 || (lb.entries[i - 1].heightM >= e.heightM && e.rank === lb.entries[i - 1].rank + 1)), 'sorted by height, ranks 1..n');
  ok(lb.entries.every((e) => e.nickname && e.country && !('best_replay' in e) && !('token' in e)), 'entries expose only rank, nickname, country, height');
  ok(lb.me && lb.me.nickname === 'Climber3' && lb.me.rank === lb.entries.findIndex((e) => e.nickname === 'Climber3') + 1, 'me block has own rank');
  ok(lb.thresholds.top1 === lb.entries[0].heightM && lb.thresholds.top5 === null, 'thresholds: top1 known, top5 null while fewer than 5 ranked players');
  const page = await call('GET', '/v1/leaderboard?limit=1&offset=1');
  ok(page.entries.length === 1 && page.entries[0].rank === 2, 'pagination');
  // a worse run never lowers the best
  const worse = await runAndSubmit(p2.token, 120, 7);
  ok(worse.res.accepted && !worse.res.newBest && worse.res.bestM === q2.res.heightM, 'a worse run keeps the best');
}

// ---- admin
{
  ok((await call('POST', '/v1/admin/rename', { body: { player: 'Climber3', nickname: 'Fixed1' } })).status === 403, 'admin needs the key');
  const adm = (path, body) => call('POST', path, { body, token: env.ADMIN_KEY });
  const rn = await adm('/v1/admin/rename', { player: 'Climber3', nickname: 'Renamed3' });
  ok(rn.ok && rn.now === 'Renamed3', 'admin can rename a player: ' + JSON.stringify(rn));
  ok((await call('GET', '/v1/leaderboard')).entries.some((e) => e.nickname === 'Renamed3'), 'new name shows on the board');
  ok((await adm('/v1/admin/rename', { player: 'Climber2', nickname: 'Renamed3' })).error === 'nick_taken', 'admin rename still keeps names unique');
  const hid = await adm('/v1/admin/hide', { player: 'Renamed3', hidden: true });
  ok(hid.hidden === true && !(await call('GET', '/v1/leaderboard')).entries.some((e) => e.nickname === 'Renamed3'), 'hidden player disappears from the board');
  await adm('/v1/admin/hide', { player: 'Renamed3', hidden: false });
  const noKey = { ...env, ADMIN_KEY: undefined };
  const r = await handle(new Request('http://x/v1/admin/hide', { method: 'POST', body: '{}' }), noKey);
  ok(r.status === 404, 'admin routes are off when no key is configured');
}

// ---- rate limiting on registration
{
  let last;
  for (let i = 0; i < 12; i++) last = await reg('Spam' + 'abcdefghijkl'[i], 'MY', '7.7.7.7');
  ok(last.error === 'rate_limited', 'registration is rate limited per IP');
}
ok((await call('GET', '/v1/health')).ok === true && (await call('GET', '/nope')).status === 404, 'health + 404');

console.log(fails ? `api: ${fails} FAILED` : 'api: all OK');
process.exit(fails ? 1 : 0);
