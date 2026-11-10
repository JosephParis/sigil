import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  playCard, playCardBare, fleeRoom,
  dismissMapPeek,
  getTheme,
  isMonster, isWeapon, isPotion,
  previewMonsterDamage,
  describePotion,
  describeWeaponStrength,
  canFleeRoom,
  tutorialAllLessonsDone,
  devourerEffectiveRank,
  HEART, DIAMOND, SUIT_GLYPH, rankLabel,
  BOSSES, TRAITS, TRAIT_IDS,
  hasAffliction,
} from '../logic'
import { PhaseRail, LogPanel } from './atoms'
import { ModeBadge } from './modes'
import { DescentSeed } from './seed'
import { AscensionBadge } from './ascensions'
import { CardSlot, HpBar, AfflictionBadges, WeaponPanel, ConditionsPanel, ForesightPanel } from './cards'
import { MapPeekModal } from './boons'
import { KitModal } from './KitModal'
import { SuitIcon, TraitIcon, cardBorderTone, suitIconTone } from './SuitIcon'
import { getSeenSpecials, markSpecialsSeen } from '../seenSpecials'
import { audio } from '../audio'

// Scan the descent-start deck (deck + dealt room) for special monster cards:
// each boss present, and each trait stamped on a monster. Returns a deduped
// list of { kind, id } in encounter-namespace order so the intro can explain
// any the player hasn't seen before.
function collectPresentSpecials(game) {
  const seen = new Set()
  const out = []
  const cards = [...(game.deck || []), ...(game.room || [])]
  for (const c of cards) {
    if (!c) continue
    if (c.boss && !seen.has(c.boss)) { seen.add(c.boss); out.push({ kind: 'boss', id: c.boss }) }
    for (const t of TRAIT_IDS) {
      if (c[t] && !seen.has(t)) { seen.add(t); out.push({ kind: 'trait', id: t }) }
    }
  }
  return out
}

// Which SFX a played card should fire. Weapons clang, monsters hit, an
// effective potion glugs; anything else (a wasted potion, a key/map/whetstone)
// just gets the soft card sound so the click still registers. The card object
// carries its real suit/rank even while face-down, so this is correct for Oath
// reveals computed at click time too.
function sfxForPlayedCard(game, card) {
  if (!card) return null
  if (isWeapon(card)) return 'equip'
  if (isMonster(card)) return 'hit'
  if (isPotion(card)) {
    const heals = game.potionsUsedThisRoom === 0 && game.hp < game.maxHp
    return heals ? 'heal' : 'cardFlip'
  }
  return 'cardFlip'
}

export function DescentView({ game, setGame }) {
  // When the player commits to a face-down card (Oath), flip it visibly first,
  // then resolve. revealing holds the room index of the card mid-reveal.
  const [revealing, setRevealing] = useState(null)
  // Theme intro: shown once when the descent mounts. Auto-dismisses, but the
  // player can tap to skip ahead. Themes that show a deck-changes animation
  // need a longer window so the last card finishes flipping before dismissal.
  const [introOpen, setIntroOpen] = useState(true)
  // Kit modal: shows full game state on mobile (weapon, conditions, log, etc.)
  const [kitOpen, setKitOpen] = useState(false)
  // First-encounter explainers: bosses/traits in this descent the player has
  // never had explained. Computed once at mount from the descent-start deck;
  // marked seen when the intro is dismissed so each fires exactly once ever.
  const newSpecials = useMemo(() => {
    const seen = new Set(getSeenSpecials())
    return collectPresentSpecials(game).filter(s => !seen.has(s.id))
  }, [game])
  const dismissIntro = useCallback(() => {
    setIntroOpen(false)
    markSpecialsSeen(newSpecials.map(s => s.id))
  }, [newSpecials])

  const introDeckChangeCount = (game.themeDeckChanges || []).reduce(
    (n, c) => n + c.additions.length + c.removals.length, 0
  )
  const introDurationMs = introDeckChangeCount > 0 ? 6200 : 4200
  useEffect(() => {
    if (!introOpen) return
    // First-encounter explainers must be read, so require a manual tap when
    // present; otherwise auto-dismiss after the usual window.
    if (newSpecials.length > 0) return
    const t = setTimeout(dismissIntro, introDurationMs)
    return () => clearTimeout(t)
  }, [introOpen, introDurationMs, newSpecials.length, dismissIntro])
  useEffect(() => {
    if (!introOpen) return
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') dismissIntro() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [introOpen, dismissIntro])

  const onCard = useCallback((i) => {
    if (revealing != null) return
    const card = game.room[i]
    // Oath (faceDown), Shrouded monsters, and any card while Blind all flip
    // before they resolve, so the player sees what they committed to.
    if (card?.faceDown || card?.shrouded || hasAffliction(game, 'blind')) {
      audio.sfx('cardFlip')
      setRevealing(i)
      return
    }
    audio.sfx(sfxForPlayedCard(game, card))
    setGame(g => playCard(g, i))
  }, [game, revealing, setGame])
  const onCardBare = useCallback((i) => {
    if (revealing != null) return
    audio.sfx('hit')
    setGame(g => playCardBare(g, i))
  }, [revealing, setGame])
  const onFlee = useCallback(() => {
    if (revealing != null) return
    audio.sfx('flee')
    setGame(g => fleeRoom(g))
  }, [revealing, setGame])

  useEffect(() => {
    if (revealing == null) return
    const t = setTimeout(() => {
      // Resolution of an Oath reveal: play the now-flipped card's category
      // sound. Actions are locked while revealing, so `game` is stable here.
      audio.sfx(sfxForPlayedCard(game, game.room[revealing]))
      setGame(g => playCard(g, revealing))
      setRevealing(null)
    }, 1400)
    return () => clearTimeout(t)
  }, [revealing, setGame, game])

  const onCloseMapPeek = useCallback(() => {
    setGame(g => dismissMapPeek(g))
  }, [setGame])
  useEffect(() => {
    if (!game.mapPeek) return
    const onKey = (e) => { if (e.key === 'Escape') onCloseMapPeek() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game.mapPeek, onCloseMapPeek])

  useEffect(() => {
    if (!kitOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setKitOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kitOpen])

  const theme = getTheme(game.theme)

  const themeIronBones = (game.themeChildren
    ? game.themeChildren.map(id => getTheme(id))
    : [theme]
  ).some(t => t && t.ironBones)

  const childNames = (game.themeChildren || [])
    .map(id => getTheme(id)?.name)
    .filter(Boolean)

  // Determine room size from theme (default 4, cramped halls has 5)
  const roomSize = (game.themeChildren
    ? game.themeChildren.map(id => getTheme(id))
    : [theme]
  ).reduce((size, t) => t?.roomSize || size, 4)

  // Tutorial cue: recommends one card per turn based on game state.
  // Recomputes whenever the room or weapon binding changes. Runs for the
  // whole tutorial descent (not only until the lessons are done): the tail
  // after the last lesson holds the deck's biggest monsters, and leaving it
  // unguided could kill a first-timer on their very first descent. Once the
  // lessons are done the cue keeps pointing at a safe move to the exit; the
  // banner just changes to acknowledge it.
  const tutorialActive = game.tutorial
  const lessonsDone = tutorialAllLessonsDone(game)
  const tutorialCue = useMemo(
    () => (tutorialActive ? computeTutorialCue(game) : null),
    [tutorialActive, game]
  )
  // While the cue points at a specific action (a card or the Flee
  // button), every other action gets locked out so the player can't
  // make a mistake during the walk.
  const cueHasTarget = tutorialActive && !!tutorialCue && (tutorialCue.recommendedId != null || tutorialCue.recommendFlee)

  return (
    <div className="animate-fade-in">
      {introOpen && (
        <ThemeIntroOverlay
          theme={theme}
          themeChildren={game.themeChildren}
          deckChanges={game.themeDeckChanges}
          newSpecials={newSpecials}
          onDismiss={dismissIntro}
        />
      )}

      <MapPeekModal cards={game.mapPeek} onClose={onCloseMapPeek} />
      <KitModal open={kitOpen} onClose={() => setKitOpen(false)} game={game} theme={theme} />

      {/* Mobile compact header - shows only on small screens.
          These four numbers are the whole read of the room at a glance -- HP,
          cards left, and what the weapon swings at -- so on a phone they are
          sized to be legible without looking, and the room below simply starts
          lower. The sigil count is deliberately absent: it changes once per
          descent and never mid-room, so it costs width here that the numbers
          the player actually reads every turn were paying for. It stays on the
          desktop rail, and both outcome screens still report it.
          All four figures are one size: they are read together, and a size
          difference between them would rank them, which nothing about the game
          supports -- HP matters as much as the weapon's reach. */}
      <div className="md:hidden mb-2 short:mb-1">
        <div className="flex flex-wrap items-center gap-2.5 short:gap-2">
          {/* HP + Deck */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="flex flex-col items-center justify-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">HP</div>
              <div className="font-mono font-bold text-parchment text-4xl leading-none">
                {game.hp}<span className="text-slate-500 text-xl">/{game.maxHp}</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">Deck</div>
              <div className="font-mono font-bold text-parchment text-4xl leading-none">{game.deck.length}</div>
            </div>
          </div>

          {/* Weapon panel and kit button, wrapping as one unit so the button
              never orphans onto a line of its own.

              The panel takes whatever the read-outs above leave, down to a
              floor. Below that floor its two labels ("Strikes as", "Bound to")
              stop fitting side by side, and squeezing them runs the two figures
              together with no way to tell which is which -- so at that point
              the pair drops to a second line and the room starts lower instead.
              The basis is the width the labels need plus the button, not a
              round number: 150 + gap + 32. */}
          <div className="flex items-center gap-2.5 flex-1 basis-[192px] min-w-0">
          {game.weapon ? (
            <div className="panel px-2 py-1.5 flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 leading-none mb-1">Weapon</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">Strikes as</div>
                  <div className="font-mono font-bold text-parchment text-4xl leading-none">
                    {describeWeaponStrength(game, game.weapon).value}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 leading-none mb-1">Bound to</div>
                  <div className={`font-mono font-bold leading-none text-4xl ${
                    game.weapon.lastSlain ? 'text-parchment' : 'text-stone-700'
                  }`}>
                    {game.weapon.lastSlain ? rankLabel(game.weapon.lastSlain.rank) : '–'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel px-2 py-1.5 flex-1 min-w-0">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 leading-none mb-1">Weapon</div>
              <div className="text-base text-slate-500 italic leading-none">Bare-handed.</div>
            </div>
          )}

          <button
            onClick={() => setKitOpen(true)}
            className="shrink-0 w-8 h-8 rounded-md bg-stone-800 hover:bg-stone-700 border border-stone-700 transition flex items-center justify-center"
            aria-label="View kit"
          >
            <span className="text-slate-400 text-base leading-none">⋮</span>
          </button>
          </div>
        </div>
      </div>

      {/* Desktop layout with sidebar - shows only on medium+ screens */}
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
        <div className="hidden md:block">
          <PhaseRail
            title={theme?.name || 'Descent'}
            subtitle={childNames.length > 0 ? childNames.join(' + ') : null}
            sigilsEarned={game.sigilsEarned}
            sigilTarget={game.sigilTarget}
          >
            <HpBar hp={game.hp} maxHp={game.maxHp} />
            <AfflictionBadges game={game} />
            <WeaponPanel game={game} />
            <ConditionsPanel game={game} theme={theme} />
            <AscensionBadge level={game.ascension} />
            <ModeBadge modeId={game.mode} />
            <DescentSeed seed={game.seed} chosen={game.seedChosen === true} />
            <LogPanel lines={game.log} collapsible />
          </PhaseRail>
        </div>

        <div className="space-y-3 short:space-y-2 md:space-y-5 min-w-0">
        <section>
          <div className="hidden md:flex items-baseline justify-between mb-3">
            <h2 className="text-[10px] uppercase tracking-[0.3em] text-slate-500">The room</h2>
            <div className="text-[13px] text-slate-500">
              Deck <span className="font-mono text-slate-300">{game.deck.length}</span> remain
            </div>
          </div>
          {game.tutorial && (
            cueHasTarget ? (
              <div className="mb-3 panel panel-warm p-4 text-[14px] text-slate-300 leading-relaxed space-y-2">
                <div>
                  <span className="text-rune font-semibold uppercase text-[11px] tracking-[0.2em] mr-2">Tutorial</span>
                  {lessonsDone
                    ? "You've learned every move. Keep taking the glowing one to reach the way out."
                    : 'Take the glowing move (explanation below it). Other actions are locked while you learn.'}
                </div>
                {!lessonsDone && (
                  <div className="text-slate-400 text-[13px]">
                    When a room is unwinnable, the cue points at <span className="text-rune">Flee the room</span> instead. Fleeing sends all 4 cards to the bottom of the deck and deals 4 fresh; you can't flee twice in a row.
                  </div>
                )}
              </div>
            ) : (
              // No card is worth a special cue (e.g. only wasteful potions left):
              // don't claim a glowing move exists or that anything is locked.
              <div className="mb-3 panel panel-warm p-4 text-[14px] text-slate-300 leading-relaxed">
                <span className="text-rune font-semibold uppercase text-[11px] tracking-[0.2em] mr-2">Tutorial</span>
                No move stands out here. Play any card to move on; sometimes you just spend a spare to refill the room.
              </div>
            )
          )}
          {/* Lift the card row above the flee button below it: a card's
              tutorial tooltip hangs down over the flee button, and the deal
              animation traps the tooltip's z-index inside the card's own
              stacking context, so without this the flee button (a later DOM
              sibling) paints on top of the opaque tooltip and shows through. */}
          <div className={`relative z-10 grid grid-cols-2 ${roomSize === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3 short:gap-2 md:gap-4 justify-items-center`}>
            {(() => { const blind = hasAffliction(game, 'blind'); const obscured = hasAffliction(game, 'obscured'); return game.room.map((c, i) => {
              let weaponDamage = null
              let bareDamage = null
              let potionPreview = null
              // Obscured hides ranks, so no damage/heal preview can be shown.
              // Blind hides the whole card (rendered as a back), so likewise.
              if (!obscured && !blind && c && isMonster(c)) {
                // During the Oath reveal animation, peek the damage of the
                // card that's flipping so the player can see what they're in for.
                const previewCard = (revealing === i && c.faceDown) ? { ...c, faceDown: false } : c
                const preview = previewMonsterDamage(game, previewCard)
                weaponDamage = preview.weapon
                bareDamage = preview.bare
              } else if (!obscured && !blind && c && (isPotion(c) || c.inscribed === 'lucky_coin') && !c.faceDown) {
                potionPreview = describePotion(game, c)
              }
              // The player has already committed once the reveal starts, so
              // suppress the bare-hands alternate to avoid implying a choice.
              const showBare = weaponDamage !== null && !themeIronBones && revealing !== i
              const isRecommended = tutorialActive && tutorialCue && c?.id === tutorialCue.recommendedId && revealing !== i
              const tip = isRecommended && c ? tutorialTipFor(game, c) : null
              const blocked = cueHasTarget && !!c && !isRecommended
              // The recommended action is to swing this monster, so the
              // bare-hands shortcut on the same card is the wrong move.
              const bareBlocked = isRecommended && !!c && isMonster(c) && tutorialCue?.recommendBare === false
              // The recommended action IS the bare-hands button: glow it so
              // the player's eye finds the right click.
              const bareRecommended = isRecommended && !!c && isMonster(c) && tutorialCue?.recommendBare === true
              // The Devourer's printed rank is 3, but its real rank is
              // 3 + the last three kills. Surface that here so the card
              // top-left reflects the threat at a glance.
              const displayRank = c?.boss === 'devourer' ? devourerEffectiveRank(game) : undefined
              return (
                <CardSlot
                  key={c?.id ?? `empty-${i}`}
                  card={c}
                  dealIndex={i}
                  reveal={revealing === i}
                  onClick={() => c && onCard(i)}
                  onBareHands={showBare ? () => onCardBare(i) : null}
                  weaponDamage={weaponDamage}
                  bareDamage={bareDamage}
                  potionPreview={potionPreview}
                  recommended={isRecommended}
                  tutorialTip={tip}
                  blocked={blocked}
                  bareBlocked={bareBlocked}
                  bareRecommended={bareRecommended}
                  displayRank={displayRank}
                  forceBack={blind}
                  obscured={obscured}
                />
              )
            }) })()}
          </div>

          <div className="mt-2 short:mt-1 md:mt-4 flex justify-center">
            <div className="group relative">
              {tutorialCue?.recommendFlee && (
                <div
                  className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 text-rune text-2xl animate-bounce pointer-events-none drop-shadow-[0_0_6px_rgba(251,191,36,0.75)]"
                  aria-hidden="true"
                >
                  ▼
                </div>
              )}
              <button
                onClick={onFlee}
                disabled={!canFleeRoom(game) || (tutorialActive && tutorialCue?.recommendedId != null)}
                className={`px-4 py-2 md:px-6 md:py-2.5 rounded-md bg-stone-800 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium border border-stone-700 transition ${tutorialCue?.recommendFlee ? 'tutorial-recommended' : ''}`}
              >
                Flee the room
              </button>
              {tutorialCue?.recommendFlee && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 w-80 rounded-lg bg-[#0f1116] p-3 text-[13px] leading-relaxed text-slate-200 text-left pointer-events-none shadow-2xl border border-rune/40"
                  role="tooltip"
                >
                  The 4 cards you flee from go to the bottom of the deck, and a fresh 4 come off the top. You can't flee two rooms in a row.
                </div>
              )}
            </div>
          </div>
        </section>

        <ForesightPanel game={game} />
      </div>
      </div>
    </div>
  )
}

// -- Theme intro overlay -----------------------------------------------

function ThemeIntroOverlay({ theme, themeChildren, deckChanges, newSpecials, onDismiss }) {
  const childThemes = (themeChildren || []).map(id => getTheme(id)).filter(Boolean)
  if (!theme) return null
  const allAdds = (deckChanges || []).flatMap(c => c.additions)
  const allRemoves = (deckChanges || []).flatMap(c => c.removals)
  const hasDeckChanges = allAdds.length > 0 || allRemoves.length > 0
  const specials = newSpecials || []
  return (
    <div
      onClick={onDismiss}
      role="button"
      tabIndex={-1}
      aria-label="Dismiss trial intro"
      className="fixed inset-0 z-40 flex items-center justify-center px-6 bg-dungeon/90 backdrop-blur-md cursor-pointer animate-fade-in"
    >
      <div className="max-w-lg text-center">
        <div className="animate-theme-intro-title">
          <h2 className="font-display text-rune text-4xl sm:text-5xl rune-pulse inline-block px-6 py-3 rounded-lg">
            {theme.name}
          </h2>
        </div>
        <p className="mt-6 text-[15px] sm:text-base text-slate-300 leading-relaxed animate-theme-intro-body">
          {theme.description}
        </p>
        {childThemes.length > 0 && (
          <ul className="mt-5 pt-4 border-t border-stone-800/80 space-y-2 text-left animate-theme-intro-children">
            {childThemes.map(c => (
              <li key={c.id} className="text-[13px] leading-snug">
                <span className="text-rune font-semibold">{c.name}</span>
                <span className="text-slate-400">: {c.description}</span>
              </li>
            ))}
          </ul>
        )}
        {hasDeckChanges && (
          <DeckChangesPreview additions={allAdds} removals={allRemoves} />
        )}
        {specials.length > 0 && (
          <NewSpecialsPreview specials={specials} />
        )}
        <div className="mt-8 text-[11px] uppercase tracking-[0.3em] text-slate-500 animate-theme-intro-children">
          Tap anywhere to begin
        </div>
      </div>
    </div>
  )
}

// Shows each card actually added or removed by the descent's theme,
// flipping into view (additions) or fading away with a strike-through
// (removals). Same flip vocabulary as the Oath face-down reveal so the
// language reads consistently as "the deck reshuffles itself".
function DeckChangesPreview({ additions, removals }) {
  // Hold off until the body/children copy has settled.
  const baseDelay = 1.0
  const stagger = 0.18
  return (
    <div
      className="mt-6 pt-4 border-t border-stone-800/80 space-y-4 animate-theme-intro-children"
    >
      {additions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400/70 mb-2">
            Added to the deck
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {additions.map((card, i) => (
              <IntroCard
                key={`add-${card.id}-${i}`}
                card={card}
                delay={baseDelay + i * stagger}
              />
            ))}
          </div>
        </div>
      )}
      {removals.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-rose-400/70 mb-2">
            Removed from the deck
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {removals.map((card, i) => (
              <IntroCard
                key={`rm-${card.id}-${i}`}
                card={card}
                delay={baseDelay + (additions.length + i) * stagger}
                removed
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function IntroCard({ card, delay, removed }) {
  const red = card.suit === HEART || card.suit === DIAMOND
  const animClass = removed ? 'animate-intro-card-remove' : 'animate-intro-card-enter'
  return (
    <div className="relative w-16 sm:w-[72px]">
      <div
        className={`aspect-[2/3] rounded-md border-2 ${cardBorderTone(card)} card-face text-stone-900 p-1.5 flex flex-col text-left ${animClass}`}
        style={{ animationDelay: `${delay}s` }}
      >
        <div className={`text-base font-bold leading-none ${red ? 'text-blood' : 'text-stone-900'}`}>
          {rankLabel(card.rank)}{SUIT_GLYPH[card.suit]}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <SuitIcon suit={card.suit} boss={card.boss} className={`w-[60%] h-auto ${suitIconTone(card)}`} />
        </div>
      </div>
      {removed && (
        <div
          className="absolute inset-0 flex items-center justify-center text-blood text-4xl font-bold pointer-events-none animate-intro-card-strike drop-shadow-[0_0_6px_rgba(185,28,28,0.7)]"
          style={{ animationDelay: `${delay + 0.5}s` }}
          aria-hidden="true"
        >
          ✕
        </div>
      )}
    </div>
  )
}

// First-encounter teaching: explains each boss/trait the player meets for the
// first time. Each row mirrors the real card (parchment face, matching border
// and symbol) next to its name and effect, so the corner symbol is legible the
// first time it ever appears. Only shown once per special (see seenSpecials).
function NewSpecialsPreview({ specials }) {
  return (
    <div className="mt-6 pt-4 border-t border-stone-800/80 text-left animate-theme-intro-children">
      <div className="text-[10px] uppercase tracking-[0.3em] text-rune/70 mb-3 text-center">
        New this descent
      </div>
      <ul className="space-y-3">
        {specials.map(s => {
          const isBoss = s.kind === 'boss'
          const info = isBoss ? BOSSES[s.id] : TRAITS[s.id]
          if (!info) return null
          return (
            <li key={s.id} className="flex items-center gap-3">
              <div className={`shrink-0 w-12 aspect-[2/3] rounded-md border-2 ${isBoss ? 'border-rune' : 'border-green-700'} card-face flex items-center justify-center`}>
                {isBoss
                  ? <SuitIcon suit={info.suit} boss={s.id} className="w-[62%] h-auto text-rune" />
                  : <TraitIcon trait={s.id} className="w-7 h-7 text-red-800" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`font-display text-sm ${isBoss ? 'text-rune' : 'text-red-300'}`}>{info.name}</span>
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">{isBoss ? 'Boss' : 'Trait'}</span>
                </div>
                <div className="text-[12.5px] text-slate-300 leading-snug">{info.description}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// -- Tutorial cue + tooltip helpers ------------------------------------

// Tutorial: which card in the current room should the player consider
// next? Priority is set so every recommendation is the smart play:
//   1. Equip a weapon if you don't have one
//   2. Replace your weapon when locked monsters block the room
//      AND a new weapon in the room would actually unlock at least one
//   3. Swing at the LARGEST usable monster (binding drops, so spend the
//      weapon's headroom on the biggest target first)
//   4. Sip a potion when hurt (smallest one that fully heals; if none
//      can fully heal, the largest non-overshooting one)
//   5. Bare-hand a lone locked monster you can safely absorb
//   6. Flee if multiple locked monsters remain, or one too big to eat
//   7. Otherwise no recommendation (room is just wind-down plays)
function computeTutorialCue(game) {
  const room = game.room.filter(Boolean)
  if (room.length === 0) return { recommendedId: null, recommendFlee: false }

  const weapon = game.weapon
  const weaponInRoom = room.find(c => isWeapon(c))
  const monsters = room.filter(c => isMonster(c))
  const potions = room.filter(c => isPotion(c))

  const bound = weapon?.lastSlain?.rank
  const usableMonsters = monsters.filter(m => {
    if (!weapon) return false
    if (bound == null) return true
    return m.rank <= bound
  })
  const lockedMonsters = monsters.filter(m => !usableMonsters.includes(m))

  const potionUseful = potions.length > 0
    && game.hp < game.maxHp
    && game.potionsUsedThisRoom === 0

  // Tutorial second bare-hands lesson, hand-curated for the
  // {7♦, 8♠, 10♦} room. The standard priorities would either skip 7♦
  // (too weak to unlock 8♠) or swing 8♠ with a fresh weapon (1 damage,
  // binds at 8 and re-locks the 10♣ waiting in the deck). Force the
  // lesson: take up 7♦, then bare-hand 8♠ to keep that swing fresh
  // for the bigger fight ahead.
  const lessons = game.tutorialLessons || []
  if (game.tutorial
      && lessons.includes('barehands')
      && !lessons.includes('barehands_choice')) {
    const tutD7 = room.find(c => c?.id === 'tut_d7')
    const tutS8 = room.find(c => c?.id === 'tut_s8')
    // Step 1: still wielding the bound weapon, with both pieces in the
    // room. Send the player to 7♦ instead of letting the standard cue
    // walk past it or jump straight to 10♦.
    if (tutD7 && tutS8 && weapon && weapon.lastSlain && weapon.rank !== 7) {
      return { recommendedId: tutD7.id, recommendFlee: false, recommendBare: false }
    }
    // Step 2: 7♦ is gone (picked up), 8♠ remains. Override the case-3
    // "swing 8♠ with fresh weapon" instinct and direct the bare-hand.
    if (tutS8 && weapon && weapon.rank === 7 && !weapon.lastSlain) {
      return { recommendedId: tutS8.id, recommendFlee: false, recommendBare: true }
    }
  }

  // 1. No weapon yet, one is sitting in the room.
  if (!weapon && weaponInRoom) {
    return { recommendedId: weaponInRoom.id, recommendFlee: false }
  }

  // 2. Replace the weapon when a swap would unlock at least one
  // currently-locked monster. A fresh weapon swings at anything until
  // its first kill, so taking it first means we fight the biggest
  // locked enemy at full power.
  if (
    weapon
    && lockedMonsters.length > 0
    && weaponInRoom
    && lockedMonsters.some(m => weaponInRoom.rank >= m.rank)
  ) {
    return { recommendedId: weaponInRoom.id, recommendFlee: false }
  }

  // 3. Swing at the biggest monster the weapon can still reach. After
  // the kill, binding drops to that monster's rank; smaller usable
  // monsters stay usable, while smaller-first would have wasted the
  // weapon's headroom.
  if (usableMonsters.length > 0) {
    const biggest = [...usableMonsters].sort((a, b) => b.rank - a.rank)[0]
    return { recommendedId: biggest.id, recommendFlee: false, recommendBare: false }
  }

  // 4. Heal. Pick the smallest potion that fully covers the missing HP
  // (so nothing spills over the cap). If none does, the largest non-
  // overshooting potion (or just the largest if all overshoot equally).
  if (potionUseful) {
    const need = game.maxHp - game.hp
    const sorted = [...potions].sort((a, b) => a.rank - b.rank)
    const exact = sorted.find(p => p.rank >= need)
    const choice = exact || sorted[sorted.length - 1]
    return { recommendedId: choice.id, recommendFlee: false }
  }

  // 5/6. Only locked monsters left (no usable swing, no useful potion,
  // no helpful weapon in the room). Decide between bare hands and flee.
  if (lockedMonsters.length > 0) {
    const smallestLocked = [...lockedMonsters].sort((a, b) => a.rank - b.rank)[0]
    // Can't flee: must bare-hand the smallest.
    if (!game.canFlee) {
      return { recommendedId: smallestLocked.id, recommendFlee: false, recommendBare: true }
    }
    // Multiple locked monsters, or one too big to safely absorb -> flee.
    const tooBig = smallestLocked.rank > Math.floor(game.hp / 2)
    if (lockedMonsters.length > 1 || tooBig) {
      return { recommendedId: null, recommendFlee: true }
    }
    // One small locked monster, can safely bare-hand it.
    return { recommendedId: smallestLocked.id, recommendFlee: false, recommendBare: true }
  }

  // 7. No strategic move left (e.g., leftover wasted potions, downgrade
  // weapons). Let the player play through without a highlight.
  return { recommendedId: null, recommendFlee: false }
}

// Per-card tutorial tip. Reads current game state so the explanation
// reflects what will actually happen if the player clicks (e.g.
// "locked, take a new weapon" vs "swing, binds at 4").
function tutorialTipFor(game, card) {
  const lessons = game.tutorialLessons || []
  const inBareChoiceSetup = game.tutorial
    && lessons.includes('barehands')
    && !lessons.includes('barehands_choice')
  if (isWeapon(card)) {
    if (!game.weapon) return 'Pick up the weapon. You equip it and can swing at monsters.'
    // Tutorial setup for the second bare-hands lesson: prefer the smaller
    // 7♦ over the optimizer's choice (10♦) so the next lesson stages a
    // strategic bare-hand instead of a clean swing.
    if (inBareChoiceSetup && card.id === 'tut_d7') {
      return "Take up 7♦, not the 10♦. The smaller weapon, but fresh. Resetting the binding matters more than raw rank here; the lesson is the choice that comes next."
    }
    const lockedAhead = game.room.some(c => c && isMonster(c) && c.rank > (game.weapon.lastSlain?.rank ?? Infinity))
    if (lockedAhead) {
      return 'Replace your weapon. The new one is fresh, swings at anything until its first kill, so use it on the biggest locked monster first.'
    }
    return 'Replaces your current weapon with a fresh one (no binding). Usually only worth taking when a monster in the room is locked.'
  }
  if (isPotion(card)) {
    if (game.potionsUsedThisRoom > 0) {
      return 'Wasted. Only the first potion drunk in a room heals; the rest pass through.'
    }
    if (game.hp >= game.maxHp) {
      return "You're already at full HP. Drinking now wastes the potion."
    }
    const need = game.maxHp - game.hp
    const healed = Math.min(card.rank, need)
    const overshoot = card.rank - healed
    if (overshoot > 0) {
      return `Heals ${healed} HP (the other ${overshoot} spills over the cap).`
    }
    return `Heals ${card.rank} HP, exactly back to full. Only the first potion drunk in a room heals; any extras are wasted.`
  }
  if (isMonster(card)) {
    if (!game.weapon) {
      return `No weapon equipped. Bare hands: take the full ${card.rank} damage.`
    }
    const bound = game.weapon.lastSlain?.rank
    if (bound !== undefined && card.rank > bound) {
      return `Your weapon is bound at ${bound}, useless against rank ${card.rank}. Bare hands take the full ${card.rank} damage.`
    }
    // Tutorial: second bare-hands lesson, fired only after the player has
    // followed the cue to pick up 7♦. With the fresh weapon in hand, the
    // raw mechanics permit a swing, but the lesson is the strategic trade.
    if (inBareChoiceSetup && card.id === 'tut_s8' && !game.weapon.lastSlain) {
      return `You can always bare-hand a monster instead of swinging, taking its full rank in damage. Do it here to keep this fresh weapon unbound for the bigger fight still in the deck.`
    }
    const damage = Math.max(0, card.rank - game.weapon.rank)
    return `Swing. Take ${damage} damage (${card.rank} - ${game.weapon.rank}). After the kill the weapon binds at ${card.rank}; only monsters of that rank or lower can be swung at.`
  }
  return null
}

