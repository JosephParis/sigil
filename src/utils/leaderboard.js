/**
 * Client for the public fastest-victory board (GET /api/leaderboard).
 *
 * Read-only and best-effort, like the rest of the server seam: there is no
 * /api in `vite dev`, and a deployment without DATABASE_URL 503s, so every
 * failure resolves to a plain error object the modal can render instead of
 * throwing. Nothing here can affect a run.
 */

const LEADERBOARD_API = '/api/leaderboard'

/**
 * Stand-in for a run whose player never set a handle. The board lists those
 * runs rather than dropping them, so every row needs something to show; the
 * server sends `playerName: null` and this is what fills the gap.
 */
export const ANONYMOUS_NAME = 'Anonymous'

// mm:ss, the conventional shape for a time to beat. Hours are rare but a long
// grind shouldn't render as "97:41", so they get their own segment.
export function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/**
 * What to print in an entry's name column.
 *
 * Your own row reads "You" whatever handle is on it -- you know who you are,
 * and it is the row you are scanning for. Everyone else reads their handle, or
 * the anonymous stand-in. A handle of whitespace is treated as absent: the
 * server already trims to null, and this repeats the check so a stray row from
 * an older deployment can't render a blank name.
 */
export function entryDisplayName(entry) {
  if (entry?.you) return 'You'
  const name = entry?.playerName?.trim()
  return name || ANONYMOUS_NAME
}

/**
 * Fetch the board.
 * @param {object} opts
 * @param {string} [opts.accountId] - the viewer's account id, so the server can
 *   mark their own rows and report their rank. 'guest' is not sent: it
 *   identifies no one in particular.
 * @param {string} [opts.deviceId] - what a guest sends instead. Their runs carry
 *   it, so it is the only thing that can pick their row out of the board --
 *   which matters most when two rows happen to share a name. Sent only when
 *   there is no account, since an account is the better answer where it exists.
 * @param {number} [opts.limit] - rows to request (server caps at 100).
 * @param {AbortSignal} [opts.signal] - abort when the modal closes.
 * @returns {Promise<{ok: true, data: object} | {ok: false, reason: string}>}
 */
export async function fetchLeaderboard({ accountId, deviceId, limit, seed, signal } = {}) {
  const params = new URLSearchParams()
  // One seed's board instead of the main one (issue 39).
  if (seed) params.set('seed', seed)
  const signedIn = accountId && accountId !== 'guest'
  if (signedIn) params.set('me', accountId)
  else if (deviceId) params.set('device', deviceId)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()

  try {
    const res = await fetch(query ? `${LEADERBOARD_API}?${query}` : LEADERBOARD_API, { signal })
    if (!res.ok) {
      // 503 is the expected "not wired up here" answer; anything else is a bug
      // on the server side, but either way the board simply can't be shown.
      return { ok: false, reason: res.status === 503 ? 'unavailable' : 'failed' }
    }
    const data = await res.json()
    if (!data || !Array.isArray(data.entries)) return { ok: false, reason: 'failed' }
    return { ok: true, data }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    // Offline, or no /api at all (dev server).
    return { ok: false, reason: 'unavailable' }
  }
}
