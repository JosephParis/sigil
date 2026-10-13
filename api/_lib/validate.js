// Server-side plausibility checks for posted run records (issue 07).
//
// /api/runs is deliberately open to guests, so anything that arrives here may be
// hand-crafted. These checks are not anti-cheat: the client is authoritative over
// its own run, so anyone willing to actually play can always produce a record
// that looks real. The goal is narrower -- reject records that are physically
// impossible, and cap what one request can do, so casual forgery costs more than
// it is worth.
//
// Deliberately PERMISSIVE about storing. A wrongly rejected record is lost data
// and there is no way to notice it happened, whereas a wrongly accepted one is
// still visible in the table and can be deleted later. Strictness about
// *publishing* belongs in api/leaderboard.js, where a false negative only hides
// one row.
//
// Imported from the game's own constants so the rules cannot drift from the
// ruleset. constants.js must stay environment-agnostic (no browser globals) for
// this to keep working from a serverless function.
import { SIGIL_TARGET, VERSION_HISTORY } from '../../src/games/scoundrel/constants.js'
import { normalizeSeed } from '../../src/games/scoundrel/seed.js'

// One request should never carry more than a device's short-outage backlog.
// historyStore caps local history at 200, so a full resend is bounded by that;
// 200 is the ceiling rather than a typical size.
export const MAX_BATCH = 200

export const OUTCOMES = new Set(['victory', 'death', 'retired'])

// Field length caps. Long enough never to truncate a real value, short enough
// that a single record cannot be used to store arbitrary bulk.
export const MAX_ACCOUNT_ID = 128
export const MAX_PLAYER_NAME = 32

// Epoch-ms sanity window. Rejects 0/1/NaN-style timestamps and anything absurdly
// far in the future, without needing to know when the game shipped.
const MIN_TIMESTAMP = Date.parse('2024-01-01T00:00:00Z')
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000 // clock skew allowance

const VERSIONS = new Set(VERSION_HISTORY)

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Check one posted run record.
 * @returns {{ok: true} | {ok: false, reason: string}} reason is a short slug,
 *   suitable for logging or a 400 body. Never echoes caller input back.
 */
export function validateRunRecord(record, now = Date.now()) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, reason: 'not_an_object' }
  }

  // --- identity -------------------------------------------------------------
  const accountId = record.accountId
  if (typeof accountId !== 'string' || !accountId) return { ok: false, reason: 'missing_account' }
  if (accountId.length > MAX_ACCOUNT_ID) return { ok: false, reason: 'account_too_long' }

  if (record.playerName != null) {
    if (typeof record.playerName !== 'string') return { ok: false, reason: 'bad_player_name' }
    if (record.playerName.length > MAX_PLAYER_NAME) return { ok: false, reason: 'player_name_too_long' }
  }

  // --- timestamps -----------------------------------------------------------
  const { startedAt, endedAt } = record
  if (!isFiniteNumber(startedAt)) return { ok: false, reason: 'missing_started_at' }
  if (startedAt < MIN_TIMESTAMP) return { ok: false, reason: 'started_at_implausible' }
  if (startedAt > now + FUTURE_TOLERANCE_MS) return { ok: false, reason: 'started_at_future' }

  if (endedAt != null) {
    if (!isFiniteNumber(endedAt)) return { ok: false, reason: 'bad_ended_at' }
    if (endedAt < startedAt) return { ok: false, reason: 'ended_before_started' }
    if (endedAt > now + FUTURE_TOLERANCE_MS) return { ok: false, reason: 'ended_at_future' }
  }

  // --- duration -------------------------------------------------------------
  // buildRunRecord computes durationMs as (endedAt - startedAt - pausedMs), so
  // it can be shorter than the wall-clock span but never longer. That is the one
  // duration invariant that holds without guessing how fast a human can play.
  if (record.durationMs != null) {
    if (!isFiniteNumber(record.durationMs)) return { ok: false, reason: 'bad_duration' }
    if (record.durationMs < 0) return { ok: false, reason: 'negative_duration' }
    if (endedAt != null && record.durationMs > endedAt - startedAt) {
      return { ok: false, reason: 'duration_exceeds_span' }
    }
  }

  // --- outcome and progress -------------------------------------------------
  if (record.outcome != null && !OUTCOMES.has(record.outcome)) {
    return { ok: false, reason: 'unknown_outcome' }
  }

  const target = isFiniteNumber(record.sigilTarget) ? record.sigilTarget : SIGIL_TARGET
  if (record.sigilsEarned != null) {
    if (!isFiniteNumber(record.sigilsEarned)) return { ok: false, reason: 'bad_sigils' }
    if (record.sigilsEarned < 0) return { ok: false, reason: 'negative_sigils' }
    if (record.sigilsEarned > target) return { ok: false, reason: 'sigils_above_target' }
  }

  // A win is defined by reaching the sigil target, so a victory claiming fewer
  // did not happen under any ruleset.
  if (record.outcome === 'victory' && isFiniteNumber(record.sigilsEarned)) {
    if (record.sigilsEarned < target) return { ok: false, reason: 'victory_below_target' }
  }

  // --- version --------------------------------------------------------------
  // Unknown versions are rejected rather than stored as null: a version that is
  // not in VERSION_HISTORY cannot have produced the run, and letting it through
  // would put uncomparable rows inside a version filter. Absent is fine -- legacy
  // records predate the stamp.
  if (record.gameVersion != null && !VERSIONS.has(record.gameVersion)) {
    return { ok: false, reason: 'unknown_game_version' }
  }

  // --- seed -----------------------------------------------------------------
  // The per-seed board matches on this exact string, so it must already be the
  // canonical code buildRunRecord writes. Absent or null is a legacy run.
  if (record.seed != null && (typeof record.seed !== 'string' || normalizeSeed(record.seed) !== record.seed)) {
    return { ok: false, reason: 'bad_seed' }
  }
  if (record.seedChosen != null && typeof record.seedChosen !== 'boolean') {
    return { ok: false, reason: 'bad_seed_chosen' }
  }

  return { ok: true }
}

/**
 * Normalize a POST body to an array of records, or explain why not.
 * @returns {{ok: true, records: object[]} | {ok: false, reason: string}}
 */
export function parseRunBatch(body, now = Date.now()) {
  const list = Array.isArray(body) ? body : [body]
  if (list.length === 0) return { ok: false, reason: 'empty_batch' }
  if (list.length > MAX_BATCH) return { ok: false, reason: 'batch_too_large' }

  const records = []
  for (const item of list) {
    const check = validateRunRecord(item, now)
    // One malformed record in a resend batch must not discard the valid ones
    // alongside it; the client cannot repair individual entries.
    if (check.ok) records.push(item)
  }
  if (records.length === 0) return { ok: false, reason: 'no_valid_records' }
  return { ok: true, records }
}

/**
 * Whether a request may write as `claimedAccountId`.
 *
 * Guests stay open: guest play is a first-class path and there is no token to
 * present. Anything claiming a real account must prove it, which is what
 * api/save.js has always done and what these write endpoints did not.
 *
 * @param {string} claimedAccountId - the id from the request body
 * @param {object|null} account - verified session payload, or null
 */
export function mayWriteAs(claimedAccountId, account) {
  if (claimedAccountId === 'guest') return true
  if (!account?.sub) return false
  return account.sub === claimedAccountId
}
