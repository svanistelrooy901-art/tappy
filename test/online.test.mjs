// The client-side leaderboard service against its on-device MOCK backend (the same shapes the real server speaks).
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { Online, countryList, flagOf } = await import('../src/services/online.js');
const { Save } = await import('../src/services/save.js');
const { RunSim } = await import('../src/core/runsim.js');
const { S } = await import('../src/core/player.js');
const { CFG } = await import('../src/config.js');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const dt = CFG.physics.step, PL = CFG.player;
Save.load();
ok(Online.isMock, 'no server configured -> mock backend');

function play(seed, quitM, ps = 1) {
  const sim = new RunSim(seed);
  let last = -9, g = 0, r = ps;
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
  return sim;
}

// not registered: no seeds, no offers
ok(Online.takeSeed() === null && Online.milestoneOffer({ maxHeightM: 500, competitiveReviveUsed: {} }) === null, 'unregistered players get no ranked seed and no milestone offer');

// nickname checks
ok((await Online.checkNick('ab')).reason === 'nick_short', 'live check: too short');
ok((await Online.checkNick('AstroKid')).available === false, 'live check: taken (a rival on the test board)');
ok((await Online.checkNick('FreshName')).available === true, 'live check: free');
ok((await Online.checkNick('f_u_c_k')).reason === 'nick_blocked', 'live check: blocked word');
ok((await Online.register('shit', 'MY')).error === 'nick_blocked', 'cannot register a blocked name');
ok((await Online.register('Mamu', 'ZZ')).error === 'country', 'cannot register a fake country');

// register
const reg = await Online.register('Mamu', 'MY');
ok(reg.ok && Online.profile.nickname === 'Mamu' && /^TAPPY-/.test(Online.profile.recoveryCode), 'register stores the profile on the device');
ok(JSON.parse(store['tappy.save']).profile.nickname === 'Mamu', 'profile is persisted in the save');
ok((await Online.register('mamu', 'SG')).error === 'nick_taken', 'name already taken');

// seeds and a ranked run
await Online.prefetchSeeds();
ok(Save.data.seeds.length >= 3, 'seeds prefetched: ' + Save.data.seeds.length);
const seed = Online.takeSeed();
ok(seed && Number.isInteger(seed.seed), 'takeSeed gives a seed');
const sim = play(seed.seed, 700);
const rep = sim.exportReplay();
const res = await Online.submit(rep, seed.token);
ok(res && res.accepted && res.heightM === Math.floor(sim.run.maxHeightM), 'score accepted: ' + JSON.stringify(res));
ok(Save.data.pending.length === 0, 'queue is empty after a successful submit');
ok((await Online.submit(rep, seed.token)) === null && Save.data.pending.length === 0, 'resubmitting the same seed is rejected and dropped (not retried forever)');

// offline: a run is kept in the queue and sent later
{
  const s2 = Online.takeSeed();
  const sim2 = play(s2.seed, 300, 2);
  const real = Online.backend.score;
  Online.backend.score = async () => ({ status: 0, error: 'network' });
  const r = await Online.submit(sim2.exportReplay(), s2.token);
  ok(r === null && Save.data.pending.length === 1, 'offline: run stays queued');
  ok(JSON.parse(store['tappy.save']).pending.length === 1, 'queue survives an app restart (persisted)');
  Online.backend.score = real;
  const sent = await Online.flush();
  ok(sent && sent.accepted && Save.data.pending.length === 0, 'back online: queued run is sent');
}

// board + thresholds
const b = await Online.board(10, 0);
ok(b.ok && b.entries.length === 10 && b.entries[0].rank === 1 && b.me.nickname === 'Mamu' && b.me.rank > 0, 'board has entries and my rank');
ok(b.thresholds.top1 > b.thresholds.top5 && b.thresholds.top5 > b.thresholds.top10, 'thresholds are ordered: ' + JSON.stringify(b.thresholds));
ok(Online.thresholds === b.thresholds, 'thresholds cached for the game to use');

// milestone offers
const T = Online.thresholds;
const mk = (h, used = {}) => ({ maxHeightM: h, competitiveReviveUsed: { top10: false, top5: false, top1: false, ...used } });
ok(Online.milestoneOffer(mk(T.top10 * 0.95))?.kind === 'top10', 'within 90% of Top 10 -> top10 offer');
ok(Online.milestoneOffer(mk(T.top10 * 0.5)) === null, 'far below any milestone -> no offer');
ok(Online.milestoneOffer(mk(T.top10 * 0.95, { top10: true })) === null, 'milestone already used this run -> no offer');
ok(Online.milestoneOffer(mk(T.top5 * 0.93))?.kind === 'top5', 'near Top 5');
ok(Online.milestoneOffer(mk(T.top1 * 0.9))?.kind === 'top1', 'exactly 90% of #1 qualifies');
ok(Online.milestoneOffer(mk(T.top1 + 5)) === null, 'already above #1 -> nothing to chase');

// recovery on a "new phone"
const code = Online.profile.recoveryCode;
const oldToken = Online.profile.token;
Save.data.profile = null; Save.data.seeds = [];
ok((await Online.recover('TAPPY-AAAA-BBBB')).error === 'code_unknown', 'wrong code');
ok((await Online.recover('nonsense')).error === 'code_format', 'malformed code');
const back = await Online.recover(code.toLowerCase());
ok(back.ok && Online.profile.nickname === 'Mamu' && Online.profile.token !== oldToken, 'recovery restores the identity with a fresh token');
ok(Save.data.best >= b.me.heightM, 'recovered best height is restored');

// countries
const cl = countryList();
ok(cl.length > 200 && cl[0].code === 'MY' && cl.some((c) => c.code === 'JP') && !cl.some((c) => c.code === 'EU'), `country list: ${cl.length} countries, Malaysia first`);
ok(flagOf('MY') === '🇲🇾', 'flag emoji');

// old saves still load (no profile fields)
Save.data = { v: 2, best: 5, wallet: 7, owned: ['default'], equipped: 'default', settings: {} };
store['tappy.save'] = JSON.stringify(Save.data);
Save.load();
ok(Save.data.profile === null && Save.data.seeds.length === 0 && Save.data.pending.length === 0 && Save.data.best === 5, 'a v2 save migrates cleanly');

console.log(fails ? `online: ${fails} FAILED` : 'online: all OK');
process.exit(fails ? 1 : 0);
