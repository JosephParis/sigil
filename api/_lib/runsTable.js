/**
 * Shared schema + key helpers for the `runs` analytics table, imported by both
 * the live mirror endpoint (api/runs.js) and the weekly backfill cron
 * (api/cron-backfill-runs.js) so the two can never drift apart. Files in api/
 * that start with `_` are treated as helpers by Vercel, never as routes.
 */

// Ensure the table exists once per warm instance. CREATE ... IF NOT EXISTS is
// idempotent and cheap; caching the promise keeps it off the hot path after the
// first call on a given lambda. Cached per module instance (per warm process).
let ready = null
export function ensureRunsTable(sql) {
  if (!ready) {
    ready = sql`
      create table if not exists runs (
        run_key       text primary key,
        account_id    text not null,
        outcome       text not null,
        mode          text,
        ascension     integer,
        sigils_earned integer,
        started_at    bigint,
        ended_at      bigint,
        duration_ms   bigint,
        record        jsonb not null,
        created_at    timestamptz not null default now()
      )
    `
      // game_version was added after the table shipped; bring existing
      // deployments forward in place. Old rows keep a null version (they
      // predate stamping) and fall outside any specific-version filter.
      .then(() => sql`alter table runs add column if not exists game_version text`)
      // dev marks runs that used the Dev overrides tool (test data). Legacy
      // rows keep a null dev, which `dev is not true` reads as a real run.
      .then(() => sql`alter table runs add column if not exists dev boolean`)
      .then(() => Promise.all([
        sql`create index if not exists runs_outcome_idx on runs (outcome)`,
        sql`create index if not exists runs_account_idx on runs (account_id)`,
        sql`create index if not exists runs_ended_idx on runs (ended_at)`,
        sql`create index if not exists runs_version_idx on runs (game_version)`,
        // The per-seed board (issue 39) filters on the seed inside the blob.
        sql`create index if not exists runs_seed_idx on runs ((record->>'seed'))`,
      ]))
  }
  return ready
}

/**
 * Stable per-run key: a re-posted finished run (effect re-fire, reload of a
 * finished save) collides here and is ignored, mirroring the client's own
 * dedupe. record.id carries a random suffix, so it is NOT used as the key.
 * runSeed (minted once at run start) is folded in when present so two devices'
 * guest runs sharing a startedAt millisecond get distinct keys; legacy runs
 * lack it and keep the old accountId:startedAt key. The backfill cron rebuilds
 * this exact string in SQL, so keep the two in step.
 */
export function runKeyFor(record) {
  const base = `${record.accountId}:${record.startedAt}`
  return record.runSeed ? `${base}:${record.runSeed}` : base
}
