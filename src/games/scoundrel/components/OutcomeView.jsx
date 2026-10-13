import { useMemo, useState } from 'react'
import { LogPanel } from './atoms'
import { RunSummary, EndingKitSection } from './RunSummary'
import { buildRunRecord } from '../history'
import { useEffectiveName, useAnonymous, MAX_HANDLE_LENGTH } from '../settings'
import { nameSuggestions } from '../assignedName'
import { SeedChallengePanel } from './seed'

// Naming yourself, at the one moment you care who won.
//
// Every player already carries a name -- assignedName.js gives one out on first
// launch -- so this is never a blank field demanding to be filled before the
// board will admit you. It states the name the victory went up under and offers
// to change it, which is a far smaller ask than the old copy's trip to Settings.
//
// Suggestions rather than an empty input: picking is easier than inventing, and
// the reroll costs nothing. The free field is still there for the player who
// arrived with a name in mind.
//
// Shown on victory only. Deaths are not ranked, so there is nothing to be
// credited for and nothing to ask about.
function LeaderboardNudge({ onClaimName, seedBoard = false }) {
  const current = useEffectiveName()
  const anonymous = useAnonymous()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  // Rolled once per opening rather than on every render, so the options do not
  // shuffle under the player's cursor as they type in the field below them.
  const [options, setOptions] = useState([])

  const reveal = () => {
    setOptions(nameSuggestions(3, current))
    setDraft('')
    setSaved(false)
    setOpen(true)
  }

  const commit = (name) => {
    const next = String(name).trim()
    if (!next) return
    setOpen(false)
    setSaved(true)
    onClaimName(next)
  }

  if (!open) {
    return (
      <p className="text-[12px] text-slate-400 -mt-1 short:-mt-2 mb-3 short:mb-2 sm:mb-4 max-w-md">
        {/* A run on an entered seed is kept off the main board (issue 38) and
            is listed only on that seed's board, so say which. */}
        {anonymous
          ? `This victory is listed ${seedBoard ? 'on the seed board ' : ''}without a name.`
          : <>This victory is listed {seedBoard ? 'on the seed board ' : ''}as <span className="text-rune">{current}</span>.</>}{' '}
        <button
          onClick={reveal}
          className="text-rune underline underline-offset-2 hover:text-amber-300 transition"
        >
          {saved ? 'Change it again' : 'Make it yours'}
        </button>
      </p>
    )
  }

  return (
    <div className="-mt-1 short:-mt-2 mb-3 short:mb-2 sm:mb-4 max-w-md w-full text-left">
      <div className="flex flex-wrap gap-1.5 justify-center">
        {options.map(name => (
          <button
            key={name}
            onClick={() => commit(name)}
            className="px-2.5 py-1 rounded-md border border-stone-700 bg-stone-900/60 text-[11.5px] text-slate-300 hover:text-parchment hover:border-rune transition"
          >
            {name}
          </button>
        ))}
        <button
          onClick={() => setOptions(nameSuggestions(3, current))}
          aria-label="Show different names"
          className="px-2 py-1 rounded-md border border-stone-700 text-[11.5px] text-slate-500 hover:text-parchment transition"
        >
          ↻
        </button>
      </div>
      <form
        className="flex gap-1.5 mt-1.5"
        onSubmit={e => { e.preventDefault(); commit(draft) }}
      >
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          maxLength={MAX_HANDLE_LENGTH}
          placeholder="or type your own"
          aria-label="Leaderboard name"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1 text-[12px] text-parchment placeholder:text-slate-600 focus:border-rune focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="px-3 rounded-md border border-stone-700 text-[11.5px] text-slate-300 hover:text-parchment hover:border-rune transition disabled:opacity-40"
        >
          Claim
        </button>
      </form>
    </div>
  )
}

// onBeginAgain wraps freshRun() in the root so this file doesn't
// depend on save/load details.
export function OutcomeView({ game, onBeginAgain, onClaimName, onReplaySeed, onOpenSeedBoard }) {
  const won = game.phase === 'victory'
  // Every victory now offers this, named or not: the run is on the board either
  // way, and the question is only whose name is against it.
  // Local view-only record; the persisted copy (with account id) is written
  // by the root's recording effect. User isn't needed for display.
  const record = useMemo(() => buildRunRecord(game, null), [game])
  const headline = won
    ? 'You are blinded by the light'
    : 'You fall in the dark.'
  const deck = record.endingDeck || []

  // Lay the summary out in two columns on desktop so the tall kit fan sits
  // beside the rest of the run details instead of stacking under it. This
  // keeps the "big web page" within the viewport without any internal scroll.
  // On narrow screens the columns stack and the page scrolls as usual.
  return (
    <div className="flex flex-col items-center text-center animate-fade-in pt-2 short:pt-0">
      <div className="space-y-2 short:space-y-1 sm:space-y-3">
        <div className={`font-display text-4xl sm:text-5xl ${won ? 'text-rune' : 'text-blood'}`}>
          {headline}
        </div>
        <div className="rune-divider mx-auto max-w-xs text-[10px] short:hidden">
          <span>✦</span>
        </div>
        {/* The summary panel below repeats this exact count, so on a short screen
            the duplicate is the cheapest line to drop. */}
        <div className="text-[11px] text-slate-500 uppercase tracking-widest short:hidden">
          {game.sigilsEarned} of {game.sigilTarget} sigils set
        </div>
      </div>

      <button
        onClick={onBeginAgain}
        className={`my-3 short:my-2 sm:my-5 px-10 py-3 short:py-2 sm:py-4 rounded-md font-display text-lg tracking-[0.2em] transition ${
          won
            ? 'bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-stone-950 border border-amber-600/80 shadow-[0_0_24px_-6px_rgba(251,191,36,0.6)]'
            : 'bg-gradient-to-b from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 text-parchment border border-red-800/80'
        }`}
      >
        {won ? 'ASCEND' : 'BEGIN AGAIN'}
      </button>

      {won && <LeaderboardNudge onClaimName={onClaimName} seedBoard={game.seedChosen === true} />}

      <SeedChallengePanel game={game} record={record} onReplaySeed={onReplaySeed} onOpenSeedBoard={onOpenSeedBoard} />

      <div className="w-full max-w-4xl grid grid-cols-[1.4fr_1fr] lg:grid-cols-2 gap-3 short:gap-2 sm:gap-5 items-start text-left">
        <div className="panel p-4 short:p-3 sm:p-6">
          <RunSummary record={record} showDeck={false} />
        </div>

        <div className="space-y-3 short:space-y-2 sm:space-y-5">
          {deck.length > 0 && (
            <div className="panel p-4 short:p-3 sm:p-6">
              <EndingKitSection deck={deck} />
            </div>
          )}
          <LogPanel lines={game.log} collapsible />
        </div>
      </div>
    </div>
  )
}
