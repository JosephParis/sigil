import { useEffect, useState } from 'react'
import { fetchLeaderboard, entryDisplayName, formatTime } from '../../../utils/leaderboard'
import { getMode } from '../constants'
import { useHandle } from '../settings'
import { deviceSeed } from '../assignedName'
import { formatSeed, formatDaily } from '../seed'

// The public fastest-victory board. Only wins are ranked, one entry per
// player, fastest first. Data comes from /api/leaderboard, which is absent in
// dev and on a deployment without a database, so the unavailable state is a
// normal outcome here rather than an error to shout about.

const BOARD_LIMIT = 25

function formatDate(ms) {
  if (!ms) return ''
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// Medals for the podium, plain numerals below it.
const MEDAL = { 1: '✦', 2: '✦', 3: '✦' }
const MEDAL_COLOR = {
  1: 'text-amber-300',
  2: 'text-slate-300',
  3: 'text-amber-700',
}

// `daily` adds the sigil count beside the time: on the daily board it is what
// ranks first, and a death is listed, so the time alone would mislead.
function Row({ entry, daily = false }) {
  const modeName = getMode(entry.mode)?.name
  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md border transition ${
        entry.you
          ? 'border-rune/50 bg-rune/5'
          : 'border-stone-800 hover:bg-stone-800/40'
      }`}
    >
      <span
        className={`font-display text-sm w-10 shrink-0 tabular-nums ${
          MEDAL_COLOR[entry.rank] || 'text-slate-500'
        }`}
      >
        {MEDAL[entry.rank] ? (
          <>
            <span aria-hidden="true">{MEDAL[entry.rank]}</span>
            <span className="ml-1">{entry.rank}</span>
          </>
        ) : (
          <>#{entry.rank}</>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {/* playerName is null for a player who never set a handle; those runs
            are listed too, under the anonymous stand-in. */}
        <span className={`block text-sm truncate ${entry.you ? 'text-rune' : 'text-parchment'}`}>
          {entryDisplayName(entry)}
        </span>
        <span className="block text-[10px] text-slate-500 truncate">
          {formatDate(entry.endedAt)}
          {modeName && modeName !== 'Default' && ` ✦ ${modeName}`}
        </span>
      </span>
      {entry.ascension > 0 && (
        <span className="text-[11px] text-slate-500 shrink-0" title={`Ascension ${entry.ascension}`}>
          A{entry.ascension}
        </span>
      )}
      {daily && (
        <span className="text-[12px] text-rune shrink-0 tabular-nums" data-testid="board-sigils">
          {entry.sigilsEarned ?? 0} {entry.sigilsEarned === 1 ? 'sigil' : 'sigils'}
        </span>
      )}
      <span className="font-display text-base text-parchment shrink-0 tabular-nums">
        {formatTime(entry.durationMs)}
      </span>
    </li>
  )
}

// The shell owns nothing but the open flag, so the body below mounts fresh on
// every open. That means it starts in its own 'loading' state and refetches
// each time, without the effect having to reset state on the way in.
//
// `seed` switches it to that seed's board (issue 39): every victory on the one
// seed, including runs where the seed was entered rather than minted, which
// the main board leaves out.
//
// `daily` (a YYYY-MM-DD date) switches it to that day's Daily Descent board
// (issue 42): every attempt with a sigil, deaths included, most sigils first
// and then fastest. It takes precedence over `seed`.
export function LeaderboardModal({ open, onClose, user, seed = null, daily = null }) {
  if (!open) return null
  return <LeaderboardBody onClose={onClose} user={user} seed={daily ? null : seed} daily={daily} />
}

function LeaderboardBody({ onClose, user, seed, daily }) {
  const [state, setState] = useState({ status: 'loading' })
  const handle = useHandle()

  // Refetch on mount and whenever the account changes: it decides which rows
  // come back marked as yours.
  useEffect(() => {
    const controller = new AbortController()
    fetchLeaderboard({
      accountId: user?.sub,
      // Signed out, this is the only thing that can mark a row as yours --
      // every guest posts as 'guest', so the account id identifies no one.
      deviceId: deviceSeed(),
      limit: BOARD_LIMIT,
      seed,
      daily,
      signal: controller.signal,
    })
      .then(result => {
        if (controller.signal.aborted) return
        setState(result.ok
          ? { status: 'ready', data: result.data }
          : { status: 'error', reason: result.reason })
      })
      .catch(() => {
        // Aborted by the cleanup below; the modal is gone.
      })
    return () => controller.abort()
  }, [user, seed, daily])

  const data = state.status === 'ready' ? state.data : null
  // Their best run, shown pinned below the page when its rank fell outside it.
  const pinnedSelf = data && data.self && !data.selfInPage ? data.self : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="panel max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 my-4 sm:my-auto relative shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 text-parchment text-xl leading-none flex items-center justify-center border border-stone-700"
          aria-label="Close leaderboard"
        >
          ×
        </button>
        <h2 className="font-display text-rune text-2xl mb-1">
          {daily
            ? <>Daily Descent <span className="text-parchment text-lg">· {formatDaily(daily)}</span></>
            : seed ? <>Seed <span className="font-mono tracking-wider">{formatSeed(seed)}</span></> : 'Fastest descents'}
        </h2>
        <p className="text-[12px] text-slate-500 mb-4">
          {daily
            ? 'Everyone’s best attempt that day: most sigils first, then fastest. Deaths count. One entry per player.'
            : seed
              ? 'Everyone who escaped this seed, fastest first, one entry per player.'
              : 'Victories only, fastest first, one entry per player.'}
          {!handle.trim() && ' Your runs are listed as Anonymous until you set a leaderboard name in Settings.'}
          {' '}Press <span className="font-mono text-slate-300">Esc</span> or click outside to close.
        </p>

        {state.status === 'loading' ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : state.status === 'error' ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {state.reason === 'unavailable'
              ? 'The leaderboard is unavailable right now.'
              : 'Could not load the leaderboard.'}
          </div>
        ) : data.entries.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {daily
              ? 'Nobody has set a sigil on this Daily yet. Clear a descent and the top spot is yours.'
              : seed
              ? 'Nobody has escaped this seed yet. Clear it and the first time is yours.'
              : 'Nobody is listed yet. Clear a run and the first time is yours.'}
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {data.entries.map(entry => (
                <Row key={entry.rank} entry={entry} daily={Boolean(daily)} />
              ))}
            </ul>
            {pinnedSelf && (
              <>
                <div className="text-center text-slate-700 text-xs py-1.5 select-none">⋮</div>
                <ul>
                  <Row entry={pinnedSelf} daily={Boolean(daily)} />
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
