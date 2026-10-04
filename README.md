# Tappy (Phaser 3 + Vite, Capacitor-ready)

Endless one-tap vertical climber. V1 scope: movement, 3 lives, seeded reachable world, coins, hazards, HUD, local best, normal rewarded revive (mock ad).

- `npm i` then `npm run dev` (add `?debug=1&seed=7` to the URL for zone lines, state and a fixed seed)
- `npm test` runs the generator reachability test (independent jump simulation) and the player rules test
- `npm run build` makes a single-file build in `dist/`
- All tunables: `src/config.js` (physics, difficulty bands, camera). Cosmetic names/prices: `src/data/cosmetics.js`.
- Ads go through `src/services/ad.js` only. Replace the mock with AdMob (Capacitor) there.
- V1.1: leaderboard + #10/#5/#1 competitive revives (flags already live in `RunState`)

## Structure (V1 prototype)
- Scenes: `Boot` -> `Menu` (home, wardrobe, settings) -> `Game`. Add `?play=1` to skip the menu (tests).
- `src/scenes/UIScene.js`: shared base (hi-res zoomed camera, layers, text, glass panels, buttons). `src/background.js`: layered space backdrop.
- Art is drawn in code: `src/art.js` (pixel alien + skins from the character sheet), `src/art_hd.js` (smooth world + UI). Render scale `CFG.Z` (`?z=1` renders at half size for fast tests / weak phones).
- Cosmetics are data (`src/data/cosmetics.js`); purchases/equip live in `src/services/save.js` (idempotent, versioned save).
- `npm test`: generator, player rules, pilot-bot, save/economy. Browser flow tests live outside the repo for now.
