// Full-screen home / main menu. Reached by clicking the SIGIL logo in
// the top bar. It's an overlay rather than a game phase, so the live run is
// untouched underneath: "Resume" just closes it. Menu entries hand off to the
// same modals the top bar opens.
import { IS_STANDALONE, HOME_URL } from '../../../buildTarget.js'
import { SeedLine } from './seed'

// onOpenCardLibrary is still wired from index.jsx for the parked Card library
// entry below, so it reads as unused until that entry comes back.
// eslint-disable-next-line no-unused-vars
export function HomeView({ open, seed, seedChosen, onResume, onOpenRules, onOpenHistory, onOpenLeaderboard, onOpenCardLibrary, onReplayTutorial, onOpenCredits, onOpenSettings, onOpenFeedback }) {
  if (!open) return null

  // TEMPORARY: Card library is parked alongside the rules modal's reference
  // tabs. Restore by uncommenting the entry below; onOpenCardLibrary is still
  // threaded in from index.jsx.
  const items = [
    { label: 'Resume', hint: 'Back to your run', onClick: onResume, accent: true },
    { label: 'How to play', hint: 'Rules, boons, trials', onClick: onOpenRules },
    { label: 'Run history', hint: 'Past descents', onClick: onOpenHistory },
    // The leaderboard is served by /api, which the standalone build cannot
    // reach (see src/buildTarget.js). An entry that always opens an empty modal
    // reads as a broken feature, so it is not offered; the footer below says
    // where it lives instead.
    ...(IS_STANDALONE ? [] : [{ label: 'Leaderboard', hint: 'Fastest victories', onClick: onOpenLeaderboard }]),
    // { label: 'Card library', hint: 'Every card in the deck', onClick: onOpenCardLibrary },
    { label: 'Tutorial', hint: 'A guided walkthrough', onClick: onReplayTutorial },
    // Settings and feedback were reachable only from the top bar, whose corner
    // badge is desktop-only -- and Settings is where a stuck run is discarded
    // (issue 27), so on a phone the escape hatch has to be on this menu too.
    { label: 'Settings', hint: 'Layout, sound, discard a run', onClick: onOpenSettings },
    // Feedback posts to /api, which the standalone build cannot reach, so it is
    // offered on the same condition the top bar uses.
    ...(IS_STANDALONE ? [] : [{ label: 'Send feedback', hint: 'Tell us what broke', onClick: onOpenFeedback }]),
    { label: 'Credits', hint: 'Who built this', onClick: onOpenCredits },
  ]

  return (
    <div className="fixed inset-0 z-40 bg-dungeon flex flex-col items-center justify-center px-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-md py-10 text-center">
        <h1 className="font-display text-rune text-5xl sm:text-6xl tracking-[0.2em]">
          SIGIL
        </h1>
        <div className="rune-divider mx-auto max-w-[10rem] mt-4 mb-8 text-[10px]">
          <span>✦</span>
        </div>
        <nav className="flex flex-col gap-2.5">
          {items.map(it => (
            <button
              key={it.label}
              onClick={it.onClick}
              className={`group w-full px-5 py-3 rounded-md border text-left flex items-baseline justify-between gap-3 transition ${
                it.accent
                  ? 'border-rune/50 bg-rune/5 hover:border-rune hover:bg-rune/10'
                  : 'border-stone-700 hover:border-rune/60 hover:bg-stone-800/40'
              }`}
            >
              <span className={`font-display tracking-wide ${it.accent ? 'text-rune' : 'text-parchment'}`}>
                {it.label}
              </span>
              <span className="text-[11px] text-slate-500 group-hover:text-slate-400 transition">
                {it.hint}
              </span>
            </button>
          ))}
        </nav>
        {seed && (
          <div className="mt-6 flex justify-center">
            <SeedLine seed={seed} chosen={seedChosen} />
          </div>
        )}
        {IS_STANDALONE && (
          <p className="mt-8 text-[11px] leading-relaxed text-slate-500">
            This copy plays entirely in your browser and saves to this device.
            <br />
            For the leaderboard and saves that follow you across devices, play at{' '}
            <a
              href={HOME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rune/80 underline underline-offset-2 hover:text-rune transition"
            >
              sigildeck.com
            </a>
            .
          </p>
        )}
      </div>
    </div>
  )
}
