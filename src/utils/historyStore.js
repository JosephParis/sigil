/**
 * Run-history storage for Scoundrel.
 *
 * localStorage is the source of truth for in-app reads: records are stored
 * namespaced by account, capped, and every method is async so the seam is
 * backend-ready. Finished runs are additionally mirrored to a server table
 * (POST /api/runs) for cross-player analytics.
 *
 * The mirror is a confirmed-delivery queue, not fire-and-forget: appendRun
 * enqueues the record in a persisted `pending` list and reconcile() posts the
 * whole queue, clearing only what the server acknowledged. So a run whose post
 * is lost (offline, tab closed mid-flight, a /api/runs outage) simply stays
 * queued and is retried on the next reconcile (run end, app load, tab hide). A
 * weekly server cron backfills signed-in accounts from their save blob as a
 * backstop; between the two, a finished run reaches analytics unless it is only
 * ever played as a never-signed-in guest whose queue never drains. Everything
 * here is best-effort and production-only: a failed or absent endpoint never
 * blocks or breaks play, and dev (no /api) skips the mirror entirely. Game/UI
 * code only ever touches the `historyStore` singleton and the methods below.
 *
 * Account id is the Google `sub` claim, or 'guest' when signed out. On first
 * login the caller invokes migrateGuest() to fold the guest bucket into the
 * account so a player's pre-login runs are not orphaned.
 */

import { getSessionToken } from './cloudSync'

const KEY_PREFIX = 'scoundrel:history:'
const GUEST_ID = 'guest'
// Records awaiting confirmed delivery to /api/runs. Global (not per-account):
// each record carries its own accountId, so guest and account runs share one
// queue that drains regardless of who is signed in.
const PENDING_KEY = 'scoundrel:history:pending'
const RUNS_API = '/api/runs'
const CLAIM_API = '/api/claim'
// When the server last confirmed one of this device's runs or names (issue
// 45). The boards are cached at the edge for a minute, so a board opened right
// after a run could show the player's previous best; the board fetch carries
// this value, which gives it a URL the cache has not seen once there is
// something new of the player's to show. Local only: cloud sync copies an
// explicit list of keys, and this is not one of them.
const BOARD_FRESH_KEY = 'scoundrel:boardFresh'
export const BOARD_FRESH_EVENT = 'scoundrel:board-fresh'

export function boardFreshness() {
  try {
    return localStorage.getItem(BOARD_FRESH_KEY) || ''
  } catch {
    return ''
  }
}

function markBoardFresh() {
  try {
    localStorage.setItem(BOARD_FRESH_KEY, String(Date.now()))
  } catch {
    // Storage disabled: the board is just as cached as it was before.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BOARD_FRESH_EVENT))
}

// Keep storage bounded so a heavy player never trips the localStorage quota.
// Oldest runs fall off the end first.
const MAX_RUNS = 200

function keyFor(accountId) {
  return KEY_PREFIX + (accountId || GUEST_ID)
}

// Stable identity for a finished run, used to dedupe re-records of the same run
// without conflating two different runs that share a startedAt millisecond (two
// devices' guest runs). runSeed is minted once at run start; legacy runs lack it
// and fall back to the old startedAt-only key, preserving their behavior.
export function runKeyOf(record) {
  return record.runSeed ? `${record.startedAt}:${record.runSeed}` : `${record.startedAt}`
}

function readRaw(accountId) {
  try {
    const raw = localStorage.getItem(keyFor(accountId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeRaw(accountId, records) {
  try {
    const trimmed = records.slice(-MAX_RUNS)
    localStorage.setItem(keyFor(accountId), JSON.stringify(trimmed))
    return trimmed
  } catch {
    // Quota exceeded or storage disabled. Silently skip, same as saveGame.
    return records
  }
}

// Server-side identity for a record, matching runKeyFor in api/_lib/runsTable.js
// (accountId:startedAt[:runSeed]). Used to dedupe the pending queue and to drop
// exactly the records a reconcile confirmed. Includes accountId because the
// queue is global across guest/account records. test/dedupeKeys.test.js asserts
// this agrees with the other three implementations.
export function serverKeyOf(record) {
  const base = `${record.accountId ?? ''}:${record.startedAt ?? ''}`
  return record.runSeed ? `${base}:${record.runSeed}` : base
}

function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writePending(records) {
  try {
    // Bound the queue like the history buckets so a long offline streak can't
    // grow it without limit; oldest unconfirmed runs fall off first.
    localStorage.setItem(PENDING_KEY, JSON.stringify(records.slice(-MAX_RUNS)))
  } catch {
    // Quota exceeded or storage disabled; skip, same as writeRaw.
  }
}

// Enqueue a record for confirmed delivery. Idempotent per run key so a re-fire
// or reload never queues the same run twice. Production-only, like the mirror.
function queuePending(record) {
  if (!import.meta.env.PROD) return
  const pending = readPending()
  const key = serverKeyOf(record)
  if (pending.some(r => serverKeyOf(r) === key)) return
  writePending(pending.concat(record))
}

class LocalHistoryStore {
  /** Returns records newest-first. */
  async listRuns(accountId) {
    return readRaw(accountId).slice().reverse()
  }

  /**
   * Appends one finished-run record. Idempotent per run: a record whose
   * startedAt already exists is skipped, so re-recording the same finished
   * run (effect re-fire, reloading a finished save, dev strict-mode double
   * invoke) never produces a duplicate. Returns the stored (newest-first) list.
   */
  async appendRun(accountId, record) {
    const existing = readRaw(accountId)
    if (record.startedAt && existing.some(r => runKeyOf(r) === runKeyOf(record))) {
      return existing.slice().reverse()
    }
    const next = writeRaw(accountId, existing.concat(record))
    // Enqueue only fresh appends (after the dedupe above) and flush now with
    // keepalive so the post survives the navigation that often follows a run
    // ending. Anything the flush can't confirm stays queued for the next
    // reconcile. Fire-and-forget: analytics delivery never blocks play.
    queuePending(record)
    this.reconcile({ keepalive: true })
    return next.slice().reverse()
  }

  /**
   * Post the pending queue to /api/runs and drop what the server acknowledged.
   * Safe to call anytime (run end, app load, tab hide): a no-op when the queue
   * is empty or in dev, one batched request otherwise, and idempotent server-
   * side so re-sending an already-stored run costs only a dropped insert. Only
   * records confirmed by this response are cleared, so a run appended mid-flight
   * stays queued. Never throws; a failed post just leaves the queue for later.
   */
  async reconcile({ keepalive = false } = {}) {
    if (!import.meta.env.PROD) return
    const pending = readPending()
    if (pending.length === 0) return
    const sentKeys = new Set(pending.map(serverKeyOf))
    try {
      // /api/runs accepts guest records unauthenticated but requires a matching
      // session token for any record claiming a real account, so the queue --
      // which mixes both -- always presents the token when there is one. A signed
      // -out player has none and posts only guest records, which is allowed.
      const token = getSessionToken()
      const res = await fetch(RUNS_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(pending),
        keepalive,
      })
      if (!res.ok) return
      // Re-read before writing: an append during the request must not be lost.
      writePending(readPending().filter(r => !sentKeys.has(serverKeyOf(r))))
      markBoardFresh()
    } catch {
      // Leave the queue intact; the next reconcile retries it.
    }
  }

  /**
   * Put a name on a run that has already finished.
   *
   * The victory screen offers this at the moment the player cares, which is
   * after the run was recorded, so three copies of the name have to move:
   * the local mirror (what the player's own history shows), the pending queue
   * (so a run still waiting to post carries the new name when it goes), and
   * the stored server row (for a run already posted).
   *
   * The order matters. Patch local state first, then reconcile -- a queued run
   * posts with the right name and needs nothing more. Then claim anyway: it is
   * idempotent, and it is the only thing that can rename a run the server
   * already has. Calling both is one redundant request on an explicit user
   * action, which is cheaper than deciding which case we are in and being wrong.
   *
   * Never throws. A failed claim leaves the run under its previous name, which
   * is a cosmetic loss, so it must not break the outcome screen.
   *
   * @param {string} accountId - whose history to patch
   * @param {object} record - the finished record being renamed
   * @param {string} name - the new name; '' means list the run without one
   * @returns {Promise<boolean>} whether the server confirmed the change
   */
  async claimRun(accountId, record, name) {
    const key = runKeyOf(record)
    const playerName = name.trim() || null
    writeRaw(accountId, readRaw(accountId).map(
      r => (runKeyOf(r) === key ? { ...r, playerName } : r),
    ))
    const serverKey = serverKeyOf(record)
    writePending(readPending().map(
      r => (serverKeyOf(r) === serverKey ? { ...r, playerName } : r),
    ))
    if (!import.meta.env.PROD) return false
    await this.reconcile()
    try {
      const token = getSessionToken()
      const res = await fetch(CLAIM_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // deviceId is what a guest owns names as: the run key proves which run
        // this is, but not which device may claim names for it.
        body: JSON.stringify({ runKey: serverKey, playerName, deviceId: record.deviceId }),
      })
      if (res.ok) markBoardFresh()
      return res.ok
    } catch {
      return false
    }
  }

  async clearRuns(accountId) {
    try {
      localStorage.removeItem(keyFor(accountId))
    } catch {
      // ignore
    }
  }

  /**
   * Fold guest runs into the given account, then clear the guest bucket.
   * No-op when there is nothing to migrate or the account is the guest itself.
   */
  async migrateGuest(accountId) {
    if (!accountId || accountId === GUEST_ID) return
    const guestRuns = readRaw(GUEST_ID)
    if (guestRuns.length === 0) return
    const merged = readRaw(accountId).concat(guestRuns)
    // Sort by start time so the merged history reads chronologically.
    merged.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
    writeRaw(accountId, merged)
    await this.clearRuns(GUEST_ID)
  }
}

export const historyStore = new LocalHistoryStore()
export { GUEST_ID }
