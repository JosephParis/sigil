-- Sigil database schema (Neon Postgres).
--
-- Nothing here needs to be run by hand: every endpoint creates and migrates its
-- own tables on first call, caching the promise per warm instance. This file is
-- the readable copy of that DDL -- the place to look before writing an
-- analytics query or debugging production -- so when you change DDL in api/,
-- change it here in the same commit. Each section names the file that owns it.
--
-- Six tables:
--   runs             -- one row per finished run       (api/_lib/runsTable.js)
--   profiles         -- one row per signed-in player   (api/save.js)
--   feedback         -- one row per note sent in-game  (api/feedback.js)
--   blocked_accounts -- moderation blocklist           (api/_lib/moderation.js)
--   rate_limits      -- fixed-window write throttle    (api/_lib/rateLimit.js)
--   handles          -- one row per claimed handle     (api/_lib/handles.js)
--
-- ---------------------------------------------------------------------------
-- runs -- owned by api/_lib/runsTable.js (ensureRunsTable), written by
-- api/runs.js and the weekly backfill cron.
--
-- Each finished run is one row. Scalar columns are denormalized for cheap
-- filtering; the full buildRunRecord() blob lives in `record` (jsonb) so the
-- schema never churns as the record shape evolves.
-- ---------------------------------------------------------------------------

create table if not exists runs (
  run_key       text primary key,        -- "<account_id>:<started_at>", stable per run
  account_id    text not null,           -- google sub, or 'guest'
  outcome       text not null,           -- victory | death | retired
  mode          text,
  ascension     integer,
  sigils_earned integer,
  started_at    bigint,                  -- epoch ms
  ended_at      bigint,                  -- epoch ms
  duration_ms   bigint,
  game_version  text,                    -- balance version stamp (GAME_VERSION); null on legacy rows
  record        jsonb not null,          -- full buildRunRecord blob
  -- Two fields inside `record` are read by queries rather than only by the
  -- client, so changing them is a schema change in practice:
  --   playerName  the name the board credits this run to; null reads Anonymous
  --   deviceId    opaque per-device id (record v8+). How api/leaderboard.js
  --               tells two guests apart, since every guest is account_id
  --               'guest'. Absent on older runs, which fall back to grouping
  --               by playerName.
  created_at    timestamptz not null default now()
);

-- Both columns were added after the table first shipped, so ensureRunsTable()
-- applies the same migrations in place and existing deployments pick them up on
-- the next call. Old rows keep a null value in each.
--
--   game_version -- balance stamp; null rows predate stamping and fall outside
--                   any specific-version filter.
--   dev          -- true when the run used the Dev overrides tool, i.e. test
--                   data. Load-bearing: api/stats.js and api/leaderboard.js
--                   both filter on `dev is not true`, which reads a legacy null
--                   as a real run.
alter table runs add column if not exists game_version text;
alter table runs add column if not exists dev boolean;

create index if not exists runs_outcome_idx on runs (outcome);
create index if not exists runs_account_idx on runs (account_id);
create index if not exists runs_ended_idx   on runs (ended_at);
create index if not exists runs_version_idx on runs (game_version);

-- ---------------------------------------------------------------------------
-- profiles -- owned by api/save.js. One row per signed-in player: the cloud
-- copy of the local save blob, plus the email the Google token carried. Guests
-- never reach this table; their save stays in localStorage.
--
-- Blocking a player (see blocked_accounts) deliberately does NOT touch this
-- row: moderation hides a handle from the public board, it does not delete
-- anybody's save.
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  account_id text primary key,             -- google sub
  email      text,
  data       jsonb not null default '{}'::jsonb,  -- merged save blob
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- feedback -- owned by api/feedback.js. One row per note a player sends from
-- the in-game feedback form. Read back by GET /api/stats (recentFeedback) and
-- deletable through DELETE /api/moderation?feedbackId=<id>, both ADMIN_TOKEN
-- gated. id is a bigserial so callers never supply one; context is a free jsonb
-- blob (phase, sigils, mode, ...) that can evolve without a schema change.
-- ---------------------------------------------------------------------------

create table if not exists feedback (
  id           bigserial primary key,
  account_id   text not null,           -- google sub, or 'guest'
  kind         text,                    -- bug | idea | praise | other
  message      text not null,
  game_version text,
  context      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback (created_at);

-- ---------------------------------------------------------------------------
-- blocked_accounts -- owned by api/_lib/moderation.js (issue 08). One row per
-- account whose runs are hidden from the public leaderboard. The save, the
-- profile and the analytics rows all stay: api/leaderboard.js subtracts this
-- set when it ranks, and nothing else reads it, so a block is fully reversible
-- and costs no data.
--
-- account_id 'guest' is refused by the endpoint -- every guest shares it, so
-- blocking it would empty the board for everyone.
-- ---------------------------------------------------------------------------

create table if not exists blocked_accounts (
  account_id text primary key,           -- google sub of the blocked player
  reason     text,                       -- admin's note to their future self
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- rate_limits -- owned by api/_lib/rateLimit.js. Fixed-window rate limiting for
-- the open write endpoints (issue 07).
--
-- One row per (endpoint, ip, window). The bucket key embeds floor(now/window),
-- so windows rotate on their own and stale rows are simply never read again; a
-- probabilistic sweep on write deletes expired ones instead of a cron. Stored in
-- Postgres rather than process memory because Vercel runs many short-lived
-- instances, and an in-memory counter is bypassed by landing on another one.
-- ---------------------------------------------------------------------------

create table if not exists rate_limits (
  bucket     text primary key,        -- "<endpoint>:<ip>:<window index>"
  hits       integer not null default 0,
  expires_at timestamptz not null     -- one full window past the one it counts
);

-- Filter any stat by balance version with a predicate on game_version, e.g.
--   where game_version = '0.1'                 -- one version
--   where game_version in ('0.2','0.3','0.4')  -- a range of versions
-- GET /api/stats?versions=<v1,v2,...> does this across every aggregation (the
-- dashboard turns a From/To range over VERSION_HISTORY into the list). Legacy
-- null rows only show when unfiltered ("All versions").

-- ---------------------------------------------------------------------------
-- Example analytics queries (dev-only; run from the Neon SQL console / psql).
-- ---------------------------------------------------------------------------

-- Winrate per boon (min sample size 20):
--   select b.v->>'id' as boon,
--          round(avg((outcome = 'victory')::int), 3) as winrate,
--          count(*) as n
--   from runs r, jsonb_array_elements(r.record->'boons') b
--   group by 1 having count(*) >= 20 order by winrate desc;

-- Winrate per boon PAIR (the thing PostHog is bad at):
--   select b1.v->>'id' as boon_a, b2.v->>'id' as boon_b,
--          round(avg((outcome = 'victory')::int), 3) as winrate,
--          count(*) as n
--   from runs r,
--        jsonb_array_elements(r.record->'boons') b1,
--        jsonb_array_elements(r.record->'boons') b2
--   where b1.v->>'id' < b2.v->>'id'
--   group by 1, 2 having count(*) >= 20 order by winrate desc;

-- Where & how players die (source x descent reached):
--   select record->'death'->>'source' as source,
--          (record->'death'->>'descent')::int as descent,
--          count(*) as deaths
--   from runs
--   where outcome = 'death' and record->'death' is not null
--   group by 1, 2 order by deaths desc;

-- Winrate per theme faced:
--   select t.v->>'id' as theme,
--          round(avg((outcome = 'victory')::int), 3) as winrate,
--          count(*) as n
--   from runs r, jsonb_array_elements(r.record->'themesFaced') t
--   group by 1 having count(*) >= 20 order by winrate desc;

-- --- Decision funnels (record v3+) -----------------------------------------

-- Boon pick rate: how often a boon is taken when it shows up in an offer.
-- Pairs with the winrate-per-boon query above to separate "good" from
-- "frequently offered".
--   select boon,
--          sum(picked) as times_picked,
--          count(*)    as times_offered,
--          round(sum(picked)::numeric / count(*), 3) as pick_rate
--   from (
--     select o.v as boon, (o.v = (p->>'picked'))::int as picked
--     from runs r,
--          jsonb_array_elements(r.record->'boonPicks') p,
--          jsonb_array_elements_text(p->'offered') o(v)
--   ) x
--   group by boon having count(*) >= 20 order by pick_rate desc;

-- Forge edit skip rate by type (inscribe / upgrade / remove):
--   select e->>'type' as type,
--          round(avg((e->>'skipped')::boolean::int), 3) as skip_rate,
--          count(*) as n
--   from runs r, jsonb_array_elements(r.record->'forgeEdits') e
--   group by 1 order by 1;

-- Most-chosen inscribe frames (what players actually inscribe):
--   select e->'chosen'->>'inscribed' as frame, count(*) as n
--   from runs r, jsonb_array_elements(r.record->'forgeEdits') e
--   where e->>'type' = 'inscribe' and e->'chosen'->>'inscribed' is not null
--   group by 1 order by n desc;

-- --- Timeline / soft-death / run-shape (record v4+) ------------------------

-- Per-descent funnel (the difficulty wall): clear/death/retire counts by
-- descent number.
--   select (d->>'descent')::int as descent,
--          count(*) as entered,
--          count(*) filter (where d->>'outcome' = 'cleared') as cleared,
--          count(*) filter (where d->>'outcome' = 'died') as died,
--          count(*) filter (where d->>'outcome' = 'retired') as retired
--   from runs r, jsonb_array_elements(r.record->'descents') d
--   group by 1 order by descent;

-- Where players quit (soft death): sanctuary (between descents) vs mid-descent.
--   select record->'retire'->>'phase' as phase, count(*) as n
--   from runs where outcome = 'retired' and record->'retire' is not null
--   group by 1 order by n desc;

-- Run shape by outcome (uses the denormalized top-level counts):
--   select outcome, count(*) n,
--          round(avg((record->>'kitEdits')::numeric), 1) avg_kit_edits,
--          round(avg((record->>'boonCount')::numeric), 1) avg_boons,
--          round(avg((record->>'inscribedCount')::numeric), 1) avg_inscribed
--   from runs group by 1 order by 1;

-- Theme survival ("chance of beating that theme"): clear vs death when the
-- theme was actually faced, from the per-descent timeline. Unbiased by run
-- depth, unlike winrate-by-theme. Beat rate excludes retires.
--   select th.v as theme,
--          count(*) as faced,
--          count(*) filter (where d->>'outcome' = 'cleared') as cleared,
--          count(*) filter (where d->>'outcome' = 'died') as died,
--          round(
--            count(*) filter (where d->>'outcome' = 'cleared')::numeric
--            / nullif(count(*) filter (where d->>'outcome' in ('cleared','died')), 0), 3
--          ) as beat_rate
--   from runs r,
--        jsonb_array_elements(r.record->'descents') d,
--        jsonb_array_elements_text(d->'themes') th(v)
--   group by 1 order by beat_rate desc;

-- One name, one owner, forever.
--
-- The public board used to show two identical rows when two players picked the
-- same name, and worse, guests were told apart *by* their name, so two sharing
-- one collapsed into a single ranked row and the slower player vanished.
-- api/leaderboard.js now partitions guests on record->>'deviceId' instead, and
-- this table makes the name itself unique so the board never shows a duplicate.
--
-- Claims are never released. A run stores the name it was posted under, so
-- freeing a name would let a second owner take it while the first owner's older
-- rows still carry it -- reproducing the duplicate this exists to prevent.
-- Keeping every claim means a given string on the board belongs to exactly one
-- owner, always. Squatting is the accepted cost at this scale.
--
-- Written by api/_lib/handles.js on the way into storage rather than reserved
-- while the player types: naming has to work offline (see that file).
create table if not exists handles (
  name_key   text primary key,          -- lower(name); "Rook" and "rook" are one claim
  name       text not null,             -- as claimed, for display and debugging
  owner_id   text not null,             -- account_id, or a guest's deviceId
  claimed_at timestamptz not null default now()
);
