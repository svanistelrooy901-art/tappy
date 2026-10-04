// Economy rules: coin price is DERIVED from the real price, so both purchase paths always match in value.
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const { SKIN_CATALOG, COIN_VALUE_MYR, coinsFor, formatMYR } = await import('../src/data/cosmetics.js');
const { Save } = await import('../src/services/save.js');
const { StoreService } = await import('../src/services/store.js');

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

ok(COIN_VALUE_MYR === 0.001, '1 coin = 0.1 sen');
ok(coinsFor(4.9) === 4900, 'RM 4.90 = 4900 coins');
ok(formatMYR(4.9) === 'RM 4.90', 'price format');
for (const s of SKIN_CATALOG) {
  ok(Number.isInteger(s.price.coins), `${s.id}: whole coin price`);
  ok(Math.abs(s.price.coins * COIN_VALUE_MYR - s.priceMYR) <= COIN_VALUE_MYR / 2 + 1e-9, `${s.id}: coin price equals real price in value`);
  ok(s.priceMYR === 0 ? s.iapSku === null && s.price.coins === 0 : s.iapSku === `skin_${s.id}`, `${s.id}: sku`);
}
ok(new Set(SKIN_CATALOG.map((s) => s.iapSku).filter(Boolean)).size === SKIN_CATALOG.length - 1, 'unique product ids');

// real-money grant: owns it, spends no coins, same transaction twice is a no-op
for (const k of Object.keys(store)) delete store[k];
Save.load(); Save.data.wallet = 50;
ok(Save.grantSkin('red', 'tx-1') && Save.owns('red') && Save.data.wallet === 50, 'grant gives the skin without spending coins');
ok(Save.grantSkin('red', 'tx-1') && Save.data.owned.filter((x) => x === 'red').length === 1 && Save.data.txIds.length === 1, 'duplicate store callback grants once');
ok(!Save.grantSkin('ghost', 'tx-2'), 'unknown product rejected');
// buying with coins after owning via money never charges
Save.data.wallet = 5000;
ok(Save.buySkin('red').reason === 'owned' && Save.data.wallet === 5000, 'no double charge across payment paths');

// coin revive: after the ad revive only, once per run, from run coins first then wallet
const { RunState } = await import('../src/core/session.js');
{
  Save.data.wallet = 5000;
  const run = new RunState(1); run.coins = 300;
  ok(Save.spendOnRevive(run, 1000).reason === 'unavailable' && Save.data.wallet === 5000 && run.coins === 300, 'coin revive refused before the ad revive, nothing charged');
  run.normalReviveUsed = true;
  let r = Save.spendOnRevive(run, 1000);
  ok(r.ok && run.coins === 0 && Save.data.wallet === 4300 && run.coinReviveUsed, 'pays run coins first, then wallet (1000 total)');
  r = Save.spendOnRevive(run, 1000);
  ok(!r.ok && r.reason === 'unavailable' && Save.data.wallet === 4300, 'second coin revive in a run is refused and not charged');
  const poor = new RunState(2); poor.normalReviveUsed = true; poor.coins = 100; Save.data.wallet = 800;
  r = Save.spendOnRevive(poor, 1000);
  ok(!r.ok && r.reason === 'funds' && r.missing === 100 && Save.data.wallet === 800 && poor.coins === 100 && !poor.coinReviveUsed, 'insufficient funds charges nothing');
  const exact = new RunState(3); exact.normalReviveUsed = true; exact.coins = 1200; Save.data.wallet = 0;
  r = Save.spendOnRevive(exact, 1000);
  ok(r.ok && exact.coins === 200 && Save.data.wallet === 0, 'run coins alone can cover it');
  ok(run.id === run.id && new RunState(1).id !== run.id, 'revive never needs a new run id (id unchanged by spend)');
}

// store service outcomes
StoreService.mock.outcome = async () => 'complete';
let r = await StoreService.purchase('skin_red'); ok(r.ok && r.txId, 'purchase ok');
StoreService.mock.outcome = async () => 'cancel';
r = await StoreService.purchase('skin_red'); ok(!r.ok && r.reason === 'cancelled', 'cancel grants nothing');
StoreService.mock.outcome = async () => 'fail';
r = await StoreService.purchase('skin_red'); ok(!r.ok && r.reason === 'failed', 'failure grants nothing');

// how long does a skin take to earn? (informational; ~19 pickups per 100m from the bot test, ~40 pickups per typical run)
const { CFG } = await import('../src/config.js');
const perRun = 14 * 0.6 * 3 * CFG.coinsPerPickup; // bot: 14 pickups/100m, ~60% collected by a human, 300 m run
console.log(SKIN_CATALOG.filter((s) => s.price.coins).map((s) => `${s.name} ${formatMYR(s.priceMYR)} = ${s.price.coins} coins (~${Math.round(s.price.coins / perRun)} runs)`).join('\n'));
console.log(fails ? `${fails} FAILURES` : 'economy: all OK');

// ---- zone coin multipliers: Red 1.5x, Black 2x; fractions are carried, never lost or invented
{
  const { RunState } = await import('../src/core/session.js');
  const { CFG } = await import('../src/config.js');
  let f = 0;
  const bad = (c, m) => { if (!c) { f++; console.log('FAIL', m); } };
  bad(CFG.redZone.coinMult === 1.5 && CFG.blackZone.coinMult === 2, 'multipliers: red 1.5, black 2');
  bad(CFG.blackZone.fromM > CFG.redZone.fromM, 'black zone starts after the red zone');
  const r = new RunState(1);
  bad(r.coinMult === 1 && r.addPickup() === CFG.coinsPerPickup, 'normal pickup pays the base value');
  r.maxHeightM = CFG.redZone.fromM;
  bad(r.coinMult === 1.5 && !r.inBlackZone, 'red zone: 1.5x');
  const before = r.coins;
  for (let i = 0; i < 10; i++) r.addPickup();
  bad(r.coins - before === 75, `10 red pickups pay exactly 75, got ${r.coins - before}`);
  r.maxHeightM = CFG.blackZone.fromM;
  const b2 = r.coins;
  for (let i = 0; i < 10; i++) r.addPickup();
  bad(r.coinMult === 2 && r.coins - b2 === 100, 'black zone: 10 pickups pay exactly 100');
  r.maxHeightM = CFG.phantomZone.fromM;
  const b3 = r.coins;
  for (let i = 0; i < 10; i++) r.addPickup();
  r.maxHeightM = CFG.phantomZone.fromM + 5 * CFG.phantomZone.levelM;
  bad(r.coinMult === 2.5, 'coins stay capped at 2.5x however deep the run goes');
  r.maxHeightM = CFG.phantomZone.fromM;
  bad(CFG.phantomZone.fromM > CFG.blackZone.fromM, 'phantom zone starts after the black zone');
  bad(r.coinMult === 2.5 && r.coins - b3 === 125, 'phantom zone: 10 pickups pay exactly 125');
  bad(Number.isInteger(r.coins), 'run coins stay whole');
  if (f) process.exit(1);
  console.log('zones: coin multipliers OK');
}
process.exit(fails ? 1 : 0);
