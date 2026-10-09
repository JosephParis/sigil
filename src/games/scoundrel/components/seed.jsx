// Run seeds on screen (issue 38): see the seed, copy a link to it, and play
// someone else's. The logic lives in seed.js; this file only shows it.
import { useState } from 'react'
import { formatSeed, normalizeSeed, seedLink } from '../seed'
import { GAME_VERSION } from '../constants'
import { IS_STANDALONE, HOME_URL } from '../../../buildTarget.js'

// The standalone build runs inside a portal's iframe, on the portal's origin,
// where a ?seed= link would not reach the game. It links to the real site.
function shareUrl(seed, version) {
  return seedLink(seed, version || GAME_VERSION, IS_STANDALONE ? HOME_URL : undefined)
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

// Opening-visit panel: the seed this run will play, and a field to play a
// friend's instead. Gone after the first descent, like the mode picker, since
// the seed locks in when the dungeon is first rolled.
export function SeedPanel({ seed, chosen, onEnter }) {
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
