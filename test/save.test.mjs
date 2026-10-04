// Save + cosmetics economy rules (no browser needed)
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { Save } = await import('../src/services/save.js');
const { SKIN_CATALOG } = await import('../src/data/cosmetics.js');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const fresh = () => { for (const k of Object.keys(store)) delete store[k]; Save.load(); };

// defaults: only the free skin, equipped
fresh();
ok(Save.data.owned.length === 1 && Save.owns('default') && Save.data.equipped === 'default', 'starts with default skin only');
ok(SKIN_CATALOG.every((s) => s.price.coins >= 0) && SKIN_CATALOG[0].price.coins === 0, 'default skin is free');

// cannot buy without funds, wallet untouched
Save.data.wallet = 3479;
let r = Save.buySkin('blue');
ok(!r.ok && r.reason === 'funds' && r.missing === 1 && Save.data.wallet === 3479 && !Save.owns('blue'), 'insufficient funds buys nothing');

// buy exactly at price
Save.data.wallet = 3480;
r = Save.buySkin('blue');
ok(r.ok && Save.owns('blue') && Save.data.wallet === 0, 'exact price purchase works');
// double tap / double callback never charges twice
Save.data.wallet = 500;
r = Save.buySkin('blue');
ok(!r.ok && r.reason === 'owned' && Save.data.wallet === 500, 'owned skin is never charged again');
ok(!Save.buySkin('nope').ok, 'unknown id rejected');

// equip rules
ok(Save.equip('blue') && Save.data.equipped === 'blue', 'can equip owned');
ok(!Save.equip('red') && Save.data.equipped === 'blue', 'cannot equip unowned');

// persistence round trip
Save.flush(); Save.load();
ok(Save.owns('blue') && Save.data.equipped === 'blue' && Save.data.wallet === 500, 'survives reload');

// run coins still commit once per run id
const run = { id: 'r1', coins: 12, maxHeightM: 150 };
Save.commitRun(run); Save.commitRun(run);
ok(Save.data.wallet === 512 && Save.data.best === 150, 'run commit is idempotent');

// v1 save (before cosmetics) migrates without losing progress
store['tappy.save'] = JSON.stringify({ v: 1, best: 321, wallet: 45, lastRunId: 'x', settings: { sound: false, haptics: true } });
Save.load();
ok(Save.data.v === 2 && Save.data.best === 321 && Save.data.wallet === 45 && Save.data.equipped === 'default' && Save.owns('default') && !Save.data.settings.sound, 'v1 save migrates');

// corrupt / tampered data falls back safely
store['tappy.save'] = JSON.stringify({ v: 2, best: 'x', wallet: null, owned: ['red', 'ghost'], equipped: 'ghost' });
Save.load();
ok(Save.owns('default') && !Save.owns('ghost') && Save.data.equipped === 'default' && Save.data.wallet === 0, 'tampered save is sanitised');
store['tappy.save'] = '{not json';
delete store['tappy.save.bak'];
Save.load();
ok(Save.data.equipped === 'default' && Save.owns('default'), 'corrupt json falls back to defaults');
// corrupt main copy but good backup: progress is recovered from the backup
store['tappy.save'] = '{not json';
store['tappy.save.bak'] = JSON.stringify({ v: 2, best: 88, wallet: 7, owned: ['default', 'pink'], equipped: 'pink' });
Save.load();
ok(Save.data.best === 88 && Save.owns('pink') && Save.data.equipped === 'pink', 'recovers from backup copy');

console.log(fails ? `${fails} FAILURES` : 'save: all OK');
process.exit(fails ? 1 : 0);
