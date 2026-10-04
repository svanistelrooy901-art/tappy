// Cosmetic catalog. Data only: change names and prices here, no code changes needed.
// Cosmetics never change gameplay (no stats, no hitbox changes). Palettes live in art.js (SKINS).
//
// ECONOMY (back-end only, never shown to players):
//   1 coin = COIN_VALUE_MYR  (0.1 sen = RM 0.001).
//   Each skin has ONE real price (priceMYR). Its coin price is DERIVED from it, so buying with coins
//   and buying with real money always cost the same value. Change priceMYR and both follow.
//   Players only see the coin price and the store price, never the exchange rate.
export const COIN_VALUE_MYR = 0.001;
export const coinsFor = (myr) => Math.round(myr / COIN_VALUE_MYR);
export const formatMYR = (myr) => `RM ${myr.toFixed(2)}`;

//  iapSku : Google Play Billing product id (create the same ids in Play Console later)
const skin = (id, name, priceMYR) => ({ id, name, priceMYR, price: { coins: coinsFor(priceMYR) }, iapSku: priceMYR > 0 ? `skin_${id}` : null });

export const SKIN_CATALOG = [
  skin('default', 'Minty', 0),
  skin('blue', 'Bluey', 3.48),
  skin('purple', 'Grape', 3.48),
  skin('pink', 'Bubblegum', 4.68),
  skin('yellow', 'Sunny', 4.68),
  skin('red', 'Ember', 5.88),
  skin('black', 'Midnight', 8.28),
];

export const SKIN_IDS = SKIN_CATALOG.map((s) => s.id);
export const skinById = (id) => SKIN_CATALOG.find((s) => s.id === id) || null;
