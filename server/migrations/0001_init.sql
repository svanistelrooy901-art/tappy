-- Tappy leaderboard. One row per player; nickname and country are permanent (only an admin rename can change a nickname).
CREATE TABLE players (
  id            TEXT PRIMARY KEY,
  nick          TEXT NOT NULL,
  nick_key      TEXT NOT NULL UNIQUE,      -- normalised form, makes "Mamu", "mamu" and "M4mu" the same name
  country       TEXT NOT NULL,             -- ISO 3166-1 alpha-2, chosen once
  token_hash    TEXT NOT NULL,             -- sha-256 of the device token (the raw token only lives on the phone)
  recovery_hash TEXT NOT NULL UNIQUE,      -- sha-256 of the recovery code
  created_at    INTEGER NOT NULL,
  best_m        INTEGER NOT NULL DEFAULT 0,
  best_at       INTEGER,                   -- when the current best was set (earlier wins a tie)
  best_replay   TEXT,                      -- the tap log behind best_m, kept so it can be re-verified later
  hidden        INTEGER NOT NULL DEFAULT 0 -- admin can hide a player from the board
);
CREATE INDEX players_board ON players (hidden, best_m DESC, best_at ASC);

-- Every accepted run (without its replay), so a monthly ranking can be added later without a new data model.
CREATE TABLE runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  TEXT NOT NULL,
  height_m   INTEGER NOT NULL,
  coins      INTEGER NOT NULL,
  ticks      INTEGER NOT NULL,
  taps       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX runs_player ON runs (player_id, created_at);
CREATE INDEX runs_month ON runs (created_at, height_m DESC);

-- Seeds are issued by the server (signed, expiring) and can be used for one run only.
CREATE TABLE used_seeds (
  seed_id TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);

-- Tiny fixed-window rate limiter (per key and window).
CREATE TABLE rate (
  k TEXT NOT NULL,
  w INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (k, w)
);
