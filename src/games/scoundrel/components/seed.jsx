// Run seeds on screen (issue 38): see the seed, copy a link to it, and play
// someone else's. The logic lives in seed.js; this file only shows it.
import { useState } from 'react'
import { formatSeed, normalizeSeed, seedLink, activeChallenge, formatDaily, todayUtc, dailyLink } from '../seed'
import { GAME_VERSION } from '../constants'
import { IS_STANDALONE, HOME_URL } from '../../../buildTarget.js'
import { formatTime } from '../../../utils/leaderboard'
import { useEffectiveName, useAnonymous } from '../settings'

// The standalone build runs inside a portal's iframe, on the portal's origin,
// where a ?seed= link would not reach the game. It links to the real site.
function shareUrl(seed, version, challenge = null) {
  return seedLink(seed, version || GAME_VERSION, IS_STANDALONE ? HOME_URL : undefined, challenge)
}

function challengerName(challenge) {
  return challenge.by || 'your friend'
}

// A time in a sentence: 2:31, not the board's column-aligned 02:31.
function spoken(ms) {
  return formatTime(ms).replace(/^0(?=\d:)/, '')
}

// Copy the share link, falling back to the bare code where the clipboard is
// unavailable (an insecure origin, or a browser that refuses the write).
function CopySeedButton({ seed, version, className = '' }) {
  const [state, setState] = useState('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(seed, version))
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`text-rune underline underline-offset-2 hover:text-amber-300 transition ${className}`}
    >
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy the code by hand' : 'Copy link'}
    </button>
  )
}

// Copy the link to today's Daily (issue 46), not the seed: a friend on the
// bare seed would be playing it off the daily board.
function CopyDailyButton({ className = '' }) {
  const [state, setState] = useState('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dailyLink(IS_STANDALONE ? HOME_URL : undefined))
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={className}
    >
      {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed: share sigildeck.com/?daily' : 'Copy Daily link'}
    </button>
  )
}

// One line: the seed and a copy link. Used in the pause menu and the run
// summary (the end-of-run screen and the history modal).
export function SeedLine({ seed, version, chosen = false }) {
  if (!seed) return null
  return (
    <p className="text-[12px] text-slate-400">
      Seed{' '}
      <span className="font-mono text-parchment tracking-wider select-all" data-testid="run-seed">
        {formatSeed(seed)}
      </span>
      {chosen && <span className="text-slate-500"> (entered)</span>}
      <span className="text-slate-600 mx-1.5">·</span>
      <CopySeedButton seed={seed} version={version} />
    </p>
  )
}

// The seed in the descent's sidebar (issue 41), so a streamed or screenshot
// run has it on screen. The sidebar only exists from md: up, so phones keep
// their layout. No copy link here: the pause menu has one.
export function DescentSeed({ seed, chosen = false }) {
  if (!seed) return null
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Seed</div>
      <div className="font-mono text-parchment text-sm tracking-wider select-all" data-testid="descent-seed">
        {formatSeed(seed)}
        {chosen && <span className="font-sans text-[11px] text-slate-500 tracking-normal"> (entered)</span>}
      </div>
    </div>
  )
}

// "Play this seed" under a run in history (issue 41). onPlay returns the
// reason it refused, or null once the run has started (and history closed).
export function PlaySeedButton({ record, onPlay }) {
  const [refusal, setRefusal] = useState(null)
  if (!record?.seed || !onPlay) return null
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setRefusal(onPlay(record))}
        className="px-4 py-2 rounded-md bg-stone-800 hover:bg-stone-700 border border-stone-600 text-parchment text-sm transition"
      >
        Play this seed
      </button>
      {refusal && (
        <p role="alert" data-testid="play-seed-refusal" className="text-[12px] text-amber-300">
          {refusal}
        </p>
      )}
    </div>
  )
}

// -- The Daily Descent (issue 42) -------------------------------------------

const dailyBtn = 'px-3 py-1.5 rounded-md border text-[12px] transition'

// Opening visit. On an ordinary run: an offer to play today's Daily. On a
// daily: which day it is, and a way back to the player's own dungeon. The
// day's seed is shown here rather than in SeedPanel, since it is not one to
// swap for a friend's.
export function DailyPanel({ game, onPlayDaily, onLeaveDaily }) {
  if (game.daily) {
    return (
      <section className="panel panel-warm p-4" data-testid="daily-panel">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="text-[10px] uppercase tracking-[0.3em] text-rune">Daily Descent</div>
          <button
            type="button"
            onClick={onLeaveDaily}
            className="text-[12px] text-slate-400 hover:text-parchment underline underline-offset-2 transition"
          >
            Play your own dungeon instead
          </button>
        </div>
        <div className="mt-1 flex items-baseline gap-3 flex-wrap">
          <span className="text-parchment font-display text-lg" data-testid="daily-date">{formatDaily(game.daily)}</span>
          <span className="font-mono text-slate-400 text-[13px] tracking-widest select-all" data-testid="opening-seed">
            {formatSeed(game.seed)}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
          Everyone plays this dungeon today, on default rules. Try it as often as you like
          {IS_STANDALONE ? '.' : '; your best attempt goes on the daily board.'} A new one opens at 00:00 UTC.
        </p>
        <CopyDailyButton className="mt-1.5 text-[12px] text-rune underline underline-offset-2 hover:text-amber-300 transition" />
      </section>
    )
  }
  return (
    <section className="panel p-4" data-testid="daily-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Daily Descent</div>
          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
            One dungeon for everyone today, ranked by sigils, then time.
          </p>
        </div>
        <button
          type="button"
          onClick={onPlayDaily}
          className={`${dailyBtn} border-rune/60 text-rune hover:border-rune hover:bg-rune/10`}
        >
          Play today’s Daily
        </button>
      </div>
    </section>
  )
}

// End of a daily attempt: the day, another go, and the board. If the day has
// turned over since the attempt began, the next go is the new day's Daily, and
// the button says so.
export function DailyOutcomePanel({ game, onPlayDaily, onOpenDailyBoard }) {
  if (!game.daily) return null
  const sameDay = todayUtc() === game.daily
  const sigils = game.sigilsEarned || 0
  return (
    <div className="mb-3 short:mb-2 sm:mb-4 max-w-md w-full flex flex-col items-center gap-2" data-testid="daily-outcome">
      <p className="text-[13px] text-parchment">
        Daily Descent, {formatDaily(game.daily)}: {sigils} {sigils === 1 ? 'sigil' : 'sigils'}.
        {sigils === 0 && ' Set one to make the board.'}
      </p>
      <div className="flex flex-wrap justify-center gap-1.5">
        <button
          type="button"
          onClick={onPlayDaily}
          className={`${dailyBtn} border-rune/60 text-rune hover:border-rune hover:bg-rune/10`}
        >
          {sameDay ? 'Try the Daily again' : 'Play today’s Daily'}
        </button>
        {!IS_STANDALONE && (
          <button
            type="button"
            onClick={onOpenDailyBoard}
            className={`${dailyBtn} border-stone-700 text-slate-300 hover:text-parchment hover:border-rune/60`}
          >
            Daily board
          </button>
        )}
        {sameDay && (
          <CopyDailyButton className={`${dailyBtn} border-stone-700 text-slate-300 hover:text-parchment hover:border-rune/60`} />
        )}
      </div>
    </div>
  )
}

// Opening-visit panel: the seed this run will play, and a field to play a
// friend's instead. Gone after the first descent, like the mode picker, since
// the seed locks in when the dungeon is first rolled.
export function SeedPanel({ seed, chosen, challenge = null, onEnter }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const code = normalizeSeed(draft)
    if (!code) {
      setError('A seed is 8 letters and numbers, like K7Q2-M9XD.')
      return
    }
    setError('')
    setOpen(false)
    setDraft('')
    onEnter(code)
  }

  return (
    <section className="panel p-4" data-testid="seed-panel">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Seed</div>
        {!open && (
          <button
            type="button"
            onClick={() => { setOpen(true); setError('') }}
            className="text-[12px] text-slate-400 hover:text-parchment underline underline-offset-2 transition"
          >
            Play a friend's seed
          </button>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-rune text-lg tracking-widest select-all" data-testid="opening-seed">
          {formatSeed(seed)}
        </span>
        <CopySeedButton seed={seed} className="text-[12px]" />
      </div>
      {challenge && (
        <p className="mt-2 text-[13px] text-parchment" data-testid="challenge-target">
          Beat {challengerName(challenge)}’s <span className="font-mono text-rune">{spoken(challenge.durationMs)}</span> on this seed.
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
        {chosen
          ? 'Same seed, same dungeon. Runs on an entered seed are kept off the main leaderboard.'
          : 'Share it and a friend plays the same dungeon. Locks in when you descend.'}
      </p>
      {open && (
        <form onSubmit={submit} className="mt-3 flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="K7Q2-M9XD"
            aria-label="Seed to play"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            autoFocus
            className="flex-1 min-w-0 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 font-mono text-[13px] tracking-wider text-parchment placeholder:text-slate-600 focus:border-rune focus:outline-none transition"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="px-3 rounded-md border border-stone-700 text-[12px] text-slate-300 hover:text-parchment hover:border-rune transition disabled:opacity-40"
          >
            Play it
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(''); setDraft('') }}
            className="px-2 rounded-md text-[12px] text-slate-500 hover:text-parchment transition"
          >
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-1.5 text-[11px] text-blood" role="alert">{error}</p>}
    </section>
  )
}

// How the run went against the time it was challenged with.
function challengeVerdict(challenge, won, durationMs) {
  const name = challengerName(challenge)
  const theirs = spoken(challenge.durationMs)
  if (!won) return `${name}’s ${theirs} stands. The seed is still there.`
  const diff = challenge.durationMs - durationMs
  if (diff > 0) return `You beat ${name}’s ${theirs} by ${spoken(diff)}.`
  if (diff === 0) return `Dead level with ${name}: ${theirs} each.`
  return `${name} still holds it: ${theirs} to your ${spoken(durationMs)}.`
}

// End-of-run block for a seeded run (issue 39): the result against a friend's
// time, a link that dares someone to beat yours, another go at the same seed,
// and that seed's board.
export function SeedChallengePanel({ game, record, onReplaySeed, onOpenSeedBoard }) {
  const name = useEffectiveName()
  const anonymous = useAnonymous()
  const [shareState, setShareState] = useState('idle')
  // A daily has its own panel (DailyOutcomePanel): its race is the daily
  // board, not a friend's time on the seed.
  if (!game.seed || game.tutorial || game.daily) return null

  const won = game.phase === 'victory'
  const challenge = activeChallenge(game)

  const dare = async () => {
    const url = shareUrl(game.seed, record.gameVersion, {
      durationMs: record.durationMs,
      by: anonymous ? null : name,
    })
    const text = `I escaped Sigil in ${spoken(record.durationMs)} on seed ${formatSeed(game.seed)}. Can you beat it?`
    // The share sheet on phones, where a link goes to a chat app; the clipboard
    // everywhere else, or when the sheet is refused.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Sigil', text, url })
        setShareState('shared')
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setShareState('copied')
    } catch {
      setShareState('failed')
    }
  }

  const btn = 'px-3 py-1.5 rounded-md border text-[12px] transition'
  return (
    <div className="mb-3 short:mb-2 sm:mb-4 max-w-md w-full flex flex-col items-center gap-2" data-testid="seed-challenge">
      {challenge && (
        <p className="text-[13px] text-parchment" data-testid="challenge-verdict">
          {challengeVerdict(challenge, won, record.durationMs)}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-1.5">
        {won && (
          <button
            type="button"
            onClick={dare}
            className={`${btn} border-rune/60 text-rune hover:border-rune hover:bg-rune/10`}
          >
            {shareState === 'copied' ? 'Challenge copied'
              : shareState === 'shared' ? 'Challenge sent'
              : shareState === 'failed' ? 'Could not copy'
              : 'Challenge a friend'}
          </button>
        )}
        <button
          type="button"
          onClick={onReplaySeed}
          className={`${btn} border-stone-700 text-slate-300 hover:text-parchment hover:border-rune/60`}
        >
          Play this seed again
        </button>
        {!IS_STANDALONE && (
          <button
            type="button"
            onClick={onOpenSeedBoard}
            className={`${btn} border-stone-700 text-slate-300 hover:text-parchment hover:border-rune/60`}
          >
            Seed board
          </button>
        )}
      </div>
    </div>
  )
}
