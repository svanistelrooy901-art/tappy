# Tappy API (V1.1 leaderboard)

Cloudflare Worker + D1 (SQLite). Verifies every submitted score by replaying the player's recorded taps through the same
`RunSim` the game uses (`src/core/runsim.js`).

## Run and test locally (no Cloudflare account needed)

```
cd server && npm install
npm run migrate:local          # creates the local D1 database
printf 'SEED_SECRET=dev\nADMIN_KEY=dev\n' > .dev.vars
npm run dev                    # http://localhost:8787
npm test                       # API tests against an in-memory SQLite stand-in for D1
```

## Deploy (needs a Cloudflare account and the Workers Paid plan)

Replaying a long run takes real CPU time (about 70 ms for a 1800 m run), more than the free plan's 10 ms limit.

```
cd server && npx wrangler login
npx wrangler d1 create tappy           # copy the database_id into wrangler.toml
npm run migrate:remote
npx wrangler secret put SEED_SECRET    # any long random string
npx wrangler secret put ADMIN_KEY      # your admin key
npm run deploy
```

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/register` | none | `{nickname, country}` -> `{token, recoveryCode, ...}`. Nickname and country are permanent. |
| GET | `/v1/nick-available?nick=` | none | live check while typing |
| POST | `/v1/recover` | none | `{code}` -> new token (the old phone's token stops working) |
| POST | `/v1/seeds` | player | 5 signed run seeds, valid 6 h, one run each |
| POST | `/v1/score` | player | `{replay, seedToken}` -> verified score and rank |
| GET | `/v1/leaderboard?limit&offset` | optional | top list, `thresholds` for Top 10/5/1, `me` when a token is sent |
| POST | `/v1/admin/rename` | admin key | `{player, nickname}`: the only way a nickname ever changes |
| POST | `/v1/admin/hide` | admin key | `{player, hidden}` |

Player auth is `Authorization: Bearer <token>`; admin auth is `Authorization: Bearer <ADMIN_KEY>`.

## Anti-cheat (what is and is not covered)

Covered: edited scores, edited tap logs, wrong seeds, re-submitting a run, borrowing another player's seed, tapping faster
than a human can, and fast-forwarding a run offline (a run cannot be longer than the real time since its seed was issued).

Not covered: a bot that plays genuinely well in real time looks like a human to the replay. Admin hide and rename are the backstop.

## When the game's rules change

Bump `SIM_VERSION` in `src/core/runsim.js` whenever a change alters how a run plays out. Logs from older versions are rejected.
