import { useEffect, useState } from 'react'
import {
  descend, pickBoon, setRunMode, setRunAscension, setRunSeed,
  applyForgeEdit, skipForgeEdit, forgeActive,
  isEnabled, BASE_MAX_HP,
} from '../logic'
import { PhaseRail, LogPanel, DescendAction } from './atoms'
import { BoonOfferPanel, RunStatePanel, DeckPeekButton, DeckModal, LoadoutPanel, RunBoonsModal } from './boons'
import { EditOfferPanel } from './forge'
import { RulesInlinePanel, TutorialIntroPanel } from './rules'
import { ModePickerPanel, ModeBadge } from './modes'
import { SeedPanel } from './seed'
import { LibraryPanel } from './library'
import { AscensionPickerPanel, AscensionBadge } from './ascensions'
import { audio } from '../audio'
import { rankLabel, SUIT_GLYPH } from '../logic'

export function SanctuaryView({ game, setGame, onSkipTutorial, ascensionUnlocked = 0, celebrateSigil = false, onSigilCelebrated, onOpenRules }) {
  const isOpeningVisit = game.sigilsEarned === 0
  const needsBoon = !isOpeningVisit && !game.boonChosen && game.boonOffers.length > 0
  // Sequence is boon → forge edits → descend. The Forge grants a batch of edits
  // worked one at a time; descend appears once the batch is done (or none).
  const forgeWaiting = game.forgeOpen && (game.forgeGrants || []).length > 0
  const showForge = !needsBoon && forgeActive(game)
  const showDescend = !needsBoon && !showForge
  const [deckOpen, setDeckOpen] = useState(false)
  const [boonsOpen, setBoonsOpen] = useState(false)

  useEffect(() => {
    if (!deckOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setDeckOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deckOpen])

  useEffect(() => {
    if (!boonsOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setBoonsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boonsOpen])

  // Exactly one panel renders in the action slot (or none, when the
  // player is idle and ready to descend).
  let actionSlot = null
  if (game.tutorial) {
    actionSlot = (
      <>
        <TutorialIntroPanel />
        <RulesInlinePanel onOpenFull={onOpenRules} />
      </>
    )
  } else if (isOpeningVisit) {
    // Ascension picker takes the rules' slot once the player has unlocked
    // the ladder. The "how to play" panel is for new players; once they've
    // beaten a run, they don't need it staring back at them.
    const showAscensionPicker = ascensionUnlocked > 0 && isEnabled('ascensions')
    actionSlot = (
      <>
        {game.tutorialJustFinished && (
          <section className="panel panel-warm p-4">
            <div className="text-rune text-[11px] font-semibold uppercase tracking-[0.2em] mb-1">Tutorial complete</div>
            <p className="text-[14px] text-slate-300 leading-relaxed">
              You've got the moves. This is the real descent now: survive to earn your first sigil, then pick a Boon and forge your kit. The dungeon won't hold your hand from here.
            </p>
          </section>
        )}
        <ModePickerPanel
          currentMode={game.mode}
          onSelect={(id) => { audio.sfx('cardFlip'); setGame(g => setRunMode(g, id)) }}
        />
        {showAscensionPicker && (
          <AscensionPickerPanel
            currentLevel={game.ascension || 0}
            ceiling={ascensionUnlocked}
            onSelect={(level) => { audio.sfx('cardFlip'); setGame(g => setRunAscension(g, level)) }}
          />
        )}
        {game.seed && (
          <SeedPanel
            seed={game.seed}
            chosen={game.seedChosen}
            onEnter={(code) => { audio.sfx('cardFlip'); setGame(g => setRunSeed(g, code)) }}
          />
        )}
        {!showAscensionPicker && <RulesInlinePanel onOpenFull={onOpenRules} />}
      </>
    )
  } else if (needsBoon) {
    actionSlot = (
      <BoonOfferPanel
        offers={game.boonOffers}
        onPick={(id) => { audio.sfx('boon'); setGame(g => pickBoon(g, id)) }}
        forgeAfter={forgeWaiting}
      />
    )
  } else if (showForge) {
    actionSlot = (
      <EditOfferPanel
        key={game.forgeGrantIndex}
        game={game}
        onPick={(cardId) => { audio.sfx('forge'); setGame(g => applyForgeEdit(g, cardId)) }}
        onSkip={() => { audio.sfx('cardFlip'); setGame(g => skipForgeEdit(g)) }}
      />
    )
  } else {
    actionSlot = <LoadoutPanel game={game} />
  }

  return (
    <div className="animate-fade-in">
      <DeckModal open={deckOpen} onClose={() => setDeckOpen(false)} game={game} />
      <RunBoonsModal
        open={boonsOpen}
        onClose={() => setBoonsOpen(false)}
        game={game}
      />

      {/* Mobile compact header - shows only on small screens. Skipped on the
          opening visit: with no sigils, no boons, and an empty kit there is
          nothing here a first-time player can act on or learn from. */}
      {!isOpeningVisit && (
      <div className="md:hidden mb-3">
        <div className="flex items-center gap-3">
          {/* HP. Sized to match the descent header's read-outs so the two
              numbers do not change size when the player descends. The sigil
              count that used to sit between HP and the weapon is gone from
              both mobile headers -- see the note in DescentView. */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">HP</span>
            <span className="font-mono font-bold text-parchment text-4xl leading-none">
              {game.maxHp || BASE_MAX_HP}
            </span>
          </div>

          {/* Weapon display (not clickable) */}
          {game.carriedWeapon && (
            <div className="flex flex-col items-center justify-center">
              <span className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">Weapon</span>
              <span className="font-mono font-bold text-parchment text-4xl leading-none">
                {rankLabel(game.carriedWeapon.rank)}{SUIT_GLYPH[game.carriedWeapon.suit]}
              </span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Boons button — this run's boons */}
          <button
            onClick={() => setBoonsOpen(true)}
            className="px-3 py-1.5 rounded-md border border-rune/40 bg-gradient-to-b from-stone-800 to-stone-900 hover:from-stone-700 hover:to-stone-800 hover:border-rune/60 transition text-[11px] font-medium text-rune"
          >
            Boons
          </button>

          {/* Kit button — same card fan the rail's "View kit" opens */}
          <button
            onClick={() => setDeckOpen(true)}
            className="px-3 py-1.5 rounded-md border border-rune/40 bg-gradient-to-b from-stone-800 to-stone-900 hover:from-stone-700 hover:to-stone-800 hover:border-rune/60 transition text-[11px] font-medium text-rune"
          >
            Kit
          </button>
        </div>
      </div>
      )}

      {/* Desktop layout with sidebar - shows only on medium+ screens */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
        <div className="hidden md:block">
          <PhaseRail
            title="Sanctuary"
            subtitle={isOpeningVisit
              ? 'You wake in a quiet chamber. The only way out leads down.'
              : 'The chamber is still. Below, the dark waits.'}
            sigilsEarned={game.sigilsEarned}
            sigilTarget={game.sigilTarget}
            celebrateSigil={celebrateSigil}
            onSigilCelebrated={onSigilCelebrated}
          >
            <div className="panel p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Lifeblood</div>
              <div className="font-mono text-parchment text-base">
                {/* Before the first descent maxHp is still 0 (computed on descend),
                    so fall back to the base so the opening visit never reads "0/0". */}
                {game.maxHp || BASE_MAX_HP}<span className="text-slate-500 text-sm">/{game.maxHp || BASE_MAX_HP}</span>
                <span className="ml-2 text-[10px] uppercase tracking-widest text-rune/70">Rested</span>
              </div>
            </div>
            <AscensionBadge level={game.ascension} />
            <ModeBadge modeId={game.mode} />
            <RunStatePanel game={game} />
            <LibraryPanel unlockedBoons={game.unlockedBoons} />
            <DeckPeekButton game={game} onClick={() => setDeckOpen(true)} />
            <LogPanel lines={game.log} collapsible />
          </PhaseRail>
        </div>

        <div className="space-y-5 min-w-0">
        {actionSlot}

        {showDescend && (
          <div className="relative">
            <DescendAction
              onDescend={() => { audio.sfx('descend'); setGame(g => descend(g)) }}
              disabled={false}
              reason={null}
            />
            {game.tutorial && onSkipTutorial && (
              <button
                onClick={onSkipTutorial}
                className="absolute right-0 bottom-0 px-4 py-2 rounded-md border border-stone-700 hover:border-stone-500 text-slate-400 hover:text-slate-200 text-sm font-medium transition"
              >
                Skip tutorial
              </button>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
