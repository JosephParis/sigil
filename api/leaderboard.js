import { neon } from '@neondatabase/serverless'
import { ensureRunsTable } from './_lib/runsTable.js'
import { ensureBlockedTable } from './_lib/moderation.js'

/**
 * GET /api/leaderboard — the public fastest-victory board.
 *
 * Unlike /api/stats this endpoint is unauthenticated: every player sees it, so
 * it returns only what the board renders and never the raw run blob. In
 * particular `account_id` (the Google `sub` claim) is used for grouping and for
 * marking the caller's own rows, then stripped from the response; the only
 * identity that leaves here is `playerName`, the handle the player typed into
 * Settings.
 *
 * Every qualifying victory is listed, handle or not. A run with no handle comes
 * back with `playerName: null` and the client renders it as "Anonymous" (see
 * entryDisplayName in src/utils/leaderboard.js), so a player who never opened
 * Settings still places instead of silently vanishing off a board they earned a
 * spot on. Nothing identifying travels with an unnamed row — rank, time, mode
 * and ascension are the whole payload — so this stays anonymous in fact and not
 * just in name.
 *
 * Only victories qualify — a fast death is not an achievement — and only one
 * row per player, so a quick player can't fill the whole board. Signed-in
 * players group by account (their handle may change; the account is the
 * player), named or not. Guests all share account_id 'guest' and so group by
 * handle instead, which is the only thing distinguishing one guest from
 * another.
 *
 * Which leaves unnamed guests, who carry nothing to tell them apart: they land
 * in one shared bucket and the board shows their single fastest run, not one
 * row each. That is the same anti-flooding rule as everyone else applied to an
 * identity we genuinely cannot resolve — the alternative, a row per run, hands
 * one guest with a stopwatch the entire top 25. The cost is real and worth
 * naming: the second-fastest unnamed guest does not appear. Signing in or
 * setting a handle is what buys a player their own line.
 *
 * Query params:
 *   limit=<n>       rows to return (default 25, max 100)
 *   me=<accountId>  the caller's own account; marks their rows `you: true` and
 *                   adds `self` (their best run and its rank) even when that
 *                   rank falls outside the returned page. Ignored for guests,
 *                   whose account id identifies no one in particular.
 *   device=<id>     what a guest sends instead of `me`: the opaque per-device
 *                   id their runs carry. Same effect, and the only way a guest
 *                   can be shown which row is theirs.
 *   version=<v>     scope the board to one balance version (see GAME_VERSION).
 *                   Absent = all versions.
 *
 * Requires DATABASE_URL. Without it the endpoint 503s and the client shows the
 * board as unavailable; play is never affected.
 *
 * Blocked accounts (issue 08) are subtracted here rather than deleted: an
 * account on the blocklist stops being published everywhere on the board at
 * once, including the caller's-own-rank query, while its runs stay in the table
 * for analytics and its save is untouched.
 *
 * Note that durations are computed client-side (wall clock between run start
 * and run end, minus pauses) and are therefore self-reported. The floor below
 * rejects the obviously impossible, but this board is a friendly ranking, not
 * an anti-cheat system.
 */

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const GUEST_ID = 'guest'
// Publish-side plausibility floors (issue 07). Storing a run is deliberately
// permissive -- losing real data is unrecoverable -- but the public board is
// where a forged record does damage, so it is filtered harder here. A false
// negative only hides one row, and these floors are set well below real play:
//
// - 60s: a win requires clearing every descent up to the sigil target. No human
//   does that in a minute; the previous 1s floor let a hand-written record claim
//   a one-second world record.
// - 15 rooms: a victory has to have entered rooms to get there. Legacy records
//   predating roomsEntered store null, so the check tolerates a missing value
//   rather than silently dropping old wins.
const MIN_DURATION_MS = 60 * 1000
const MIN_ROOMS_FOR_VICTORY = 15

function parseLimit(raw) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(n, MAX_LIMIT)
}

// One row per player, their fastest qualifying victory, ranked.
//
// The partition takes two expressions rather than one concatenated key, so no
// string building is needed: signed-in players group by account_id alone (the
// second expression is a constant for them, and their name may change between
// runs without splitting them into two entries), while guests, who all share
// account_id 'guest', need something else to tell them apart.
//
// That something is `deviceId`, not the player's name. Grouping guests by name
// meant name equality was treated as person equality: two guests who happened
// to share one — assigned or typed — landed in the same bucket, and only the
// faster was ranked at all. The other vanished from a board they had earned a
// place on. A name is a label; identity is the device that posted the run.
//
// The coalesce chain is a migration path, not tidying. Runs predating record
// v8 carry no deviceId and fall back to grouping by name, exactly as they
// always did, so no stored row changes behaviour. The trailing '' catches the
// oldest rows, which have neither and keep sharing one bucket — SQL would
// otherwise treat a bare null as its own group per row.
//
// Kept as a single fragment so the board query and the caller's-own-rank query
// rank against the same population.
function rankedBest(versionCond) {
  return sql`(
    select account_id, ascension, sigils_earned, duration_ms, ended_at, mode,
           game_version, player_name, device_id,
           row_number() over (order by duration_ms asc, ended_at asc) rank
    from (
      select r.*, nullif(btrim(r.record->>'playerName'), '') player_name,
             nullif(r.record->>'deviceId', '') device_id,
             row_number() over (
               partition by r.account_id,
                            case when r.account_id = ${GUEST_ID}
                                 then coalesce(
                                        nullif(r.record->>'deviceId', ''),
                                        btrim(r.record->>'playerName'),
                                        '')
                                 else '' end
               order by r.duration_ms asc, r.ended_at asc
             ) player_rn
      from runs r
      where r.outcome = 'victory'
        and r.dev is not true
        -- A run on a seed the player entered (issue 38) replays a dungeon they
        -- may already know, which is a head start over a fresh run. Those race
        -- each other on the seed, not on this board. A legacy row has no
        -- seedChosen and reads as a fresh run.
        and coalesce(r.record->>'seedChosen', 'false') <> 'true'
        -- Moderation blocklist. Applied inside the ranked subquery so a blocked
        -- account is gone before row_number() runs: removing it afterwards
        -- would leave a hole in the ranking where their row used to be.
        and not exists (
          select 1 from blocked_accounts bl where bl.account_id = r.account_id
        )
        and r.duration_ms >= ${MIN_DURATION_MS}
        -- Casts are regex-guarded, not bare ::int. The endpoint that writes these
        -- rows was open and unvalidated until issue 07, so a single stored row
        -- with a non-numeric value here would otherwise abort the whole query and
        -- take the board down. A non-numeric value reads as absent.
        and coalesce(
              case when r.record->>'roomsEntered' ~ '^[0-9]+$'
                   then (r.record->>'roomsEntered')::int end,
              ${MIN_ROOMS_FOR_VICTORY}
            ) >= ${MIN_ROOMS_FOR_VICTORY}
        and coalesce(
              case when r.record->>'sigilsEarned' ~ '^[0-9]+$'
                   then (r.record->>'sigilsEarned')::int end,
              r.sigils_earned, 0
            ) >= coalesce(
              case when r.record->>'sigilTarget' ~ '^[0-9]+$'
                   then (r.record->>'sigilTarget')::int end,
              1
            )
        ${versionCond}
    ) per_player
    where player_rn = 1
  )`
}

// Shape a DB row for the wire: numbers coerced out of bigint strings, and both
// account_id and device_id dropped so no caller ever learns another player's
// identity. `you` is computed here, server-side, precisely so the comparison
// can be made without either value crossing the wire.
function toEntry(row, me, device) {
  // A guest cannot be recognised by account_id -- every guest is 'guest' -- so
  // their own row is found by the device that posted it. This is what makes two
  // rows sharing a name survivable: whichever one is yours reads "You".
  const mine = Boolean(me) && row.account_id === me
  const myDevice = Boolean(device) && row.account_id === GUEST_ID && row.device_id === device
  return {
    rank: Number(row.rank),
    playerName: row.player_name || null,
    ascension: row.ascension === null ? 0 : Number(row.ascension),
    sigilsEarned: row.sigils_earned === null ? null : Number(row.sigils_earned),
    durationMs: Number(row.duration_ms),
    endedAt: row.ended_at === null ? null : Number(row.ended_at),
    mode: row.mode || 'default',
    gameVersion: row.game_version || null,
    you: mine || myDevice,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }
  if (!sql) return res.status(503).json({ error: 'database_not_configured' })

  const limit = parseLimit(req.query?.limit)
  const version = typeof req.query?.version === 'string' ? req.query.version.trim() : ''
  const versionCond = version ? sql`and r.game_version = ${version}` : sql``
  // A guest id identifies no one in particular, so it can't mark "your" rows.
  const meRaw = typeof req.query?.me === 'string' ? req.query.me.trim() : ''
  const me = meRaw && meRaw !== GUEST_ID ? meRaw : ''
  // What a guest sends instead. It marks and ranks only their own rows, and is
  // never echoed back, so presenting someone else's tells you nothing you could
  // not already see.
  const device = typeof req.query?.device === 'string' ? req.query.device.trim() : ''

  try {
    // Idempotent and cached per warm instance (see runsTable.js). Keeps the
    // board working on a deployment where no run has been mirrored yet, rather
    // than 500ing on a missing table.
    await Promise.all([ensureRunsTable(sql), ensureBlockedTable(sql)])
    const ranked = rankedBest(versionCond)
    const [rows, selfRows] = await Promise.all([
      sql`select * from ${ranked} b order by rank asc limit ${limit}`,
      // The caller's own best, fetched separately so their rank still shows
      // when it sits past the returned page. Skipped entirely for guests.
      me
        ? sql`select * from ${ranked} b where b.account_id = ${me} limit 1`
        : device
          ? sql`select * from ${ranked} b
                 where b.account_id = ${GUEST_ID} and b.device_id = ${device} limit 1`
          : Promise.resolve([]),
    ])

    const entries = rows.map(row => toEntry(row, me, device))
    const self = selfRows.length > 0 ? toEntry(selfRows[0], me, device) : null

    // Public and identical for everyone but the `me` marking, so let the CDN
    // absorb the traffic. Short TTL keeps a fresh record visible quickly.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({
      generatedAt: Date.now(),
      version: version || null,
      limit,
      entries,
      // Present but outside the page? The client renders it as a pinned row.
      self,
      selfInPage: Boolean(self) && entries.some(e => e.rank === self.rank),
    })
  } catch {
    return res.status(500).json({ error: 'query_failed' })
  }
}
