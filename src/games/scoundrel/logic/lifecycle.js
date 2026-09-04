import { SUIT_GLYPH, SIGIL_TARGET, DEFAULT_MODE, MODES, getMode, isMonster, isWeapon, isPotion, rankLabel } from '../constants'
import { getTheme, pickThemeId, resolveThemeChildren } from '../themes'
import { BOONS, pickBoonOffers, STARTER_BOON_IDS, UNLOCKABLE_BOON_IDS } from '../boons'
import { getAscensionEffectsForState } from '../ascensions'
import { isEnabled as isFlagEnabled } from '../flags'
import {
  appendLog,
  themesFor, themeFlagAny, getRoomSize,
  computeMaxHp,
  hasBoon,
  markTutorialLesson,
} from './helpers'
import { buildDescentDeck, buildTutorialDeck, buildStartingKit } from './deck'
import { rollForgeGrants, initForgeBatch } from './sanctuary'
import { applyRoomEntryEffects } from './combat'

// -- Run lifecycle ------------------------------------------------------

export function createRun(rng = Math.random, options = {}) {
  // On the very first sanctuary visit (before descent 1) there is no Boon
  // offer and no Forge. Descent 1 of every run runs under "The Quiet", a
  // friendly warm-up theme that gives +10 max HP. Tier-1 themes start at
  // descent 2.
  //
  // When `tutorial` is requested, the player walks a curated
  // descent first. Tutorial completion: no sigil, no boon, then The
  // Quiet starts as normal.
  //
  // The `mode` option locks the run into an alternate ruleset (Hardcore,
  // Quiet Run, etc). Default is the full game. Mode is fixed for the run
  // once chosen and read at sanctuary-visit and theme-pick edges.
  //
  // `unlockedBoons` is the player's Boon library: the set of Boons that can
  // appear in offers this run. Defaults to the starter set for first-time
  // players. The caller (root) loads/saves the library to localStorage so
  // unlocks persist across runs.
  //
  // `ascension` is the difficulty level (0 = base). Read at sanctuary,
  // descent, and combat edges via getAscensionEffectsForState.
  const {
    tutorial = false,
    mode = DEFAULT_MODE,
    unlockedBoons = STARTER_BOON_IDS,
    ascension = 0,
  } = options
  const nextTheme = tutorial ? 'tutorial' : 'the_quiet'

  return {
    phase: 'sanctuary',
    sigilsEarned: 0,
    sigilTarget: SIGIL_TARGET,
    tutorial,
    mode,
    ascension,
    unlockedBoons: unlockedBoons.slice(),
    // Set of tutorial lessons the player has completed. Used by the
    // UI to decide when to stop recommending actions and showing
    // hover tips. Possible values: 'equip', 'fight', 'potion',
    // 'replace', 'barehands', 'barehands_choice', 'flee'.
    tutorialLessons: [],
    boons: [],
    // The player's kit: weapons and potions they own and edit across the run.
    // Seeded as the low ten (diamonds 2-6, hearts 2-6). Persists across descents
    // (never in a reset list, so the { ...state } spreads carry it forward).
    kit: buildStartingKit(),
    // Count of kit edits applied this run (Inscribe / Upgrade / Remove).
    // Run-level, surfaced in the run summary.
    kitEdits: 0,
    carriedWeapon: null,
    carriedSpareWeapon: null,
    rng,

    boonOffers: [],
    nextTheme,
    nextThemeChildren: null,
    forgeOpen: false,
    boonChosen: true, // no Boon to pick on the opening visit
    // The Forge's granted edit batch for the visit: the ordered edit types, the
    // index of the active edit, and the cards offered for it. Rolled when the
    // forge opens (see endDescentVictory); empty on the opening visit.
    forgeGrants: [],
    forgeGrantIndex: 0,
    forgeChoices: [],
    // Kit cards inscribed during the current forge visit. Held out of that
    // visit's Upgrade offers; cleared each time the forge opens.
    forgeInscribedIds: [],

    hp: 0,
    maxHp: 0,
    deck: [],
    room: [],
    weapon: null,
    spareWeapon: null,
    potionsUsedThisRoom: 0,
    canFlee: true,
    discard: [],
    theme: null,
    themeChildren: null,
    themeDeckChanges: [],
    monstersFoughtThisRoom: 0,
    lastMonsterSuit: null,
    roomsEntered: 0,
    afflictions: {},
    mutedBoon: null,

    // Run-level history accumulators. Unlike the per-descent fields below,
    // these persist across descents (they're never in a reset list, so the
    // `{ ...state }` spreads in descend/endDescentVictory carry them forward)
    // and are snapshotted into a stored record by buildRunRecord at run end.
    runStartedAt: Date.now(),
    // Stable per-run token minted once here and carried for the run's whole
    // life (never reset, persisted in the save, snapshotted at run end). It
    // disambiguates the run-dedupe key when two devices' guest runs happen to
    // share a startedAt millisecond; re-recording the same run reuses it, so
    // idempotency holds. Legacy runs lack it and fall back to the old key.
    runSeed: Math.random().toString(36).slice(2, 10),
    // Wall-clock time spent paused (home/pause menu open), in ms. Subtracted
    // from the run's duration at record time so idling in the menu doesn't
    // inflate playtime. pausedAt holds the start of the current pause, or null.
    pausedMs: 0,
    pausedAt: null,
    themesFaced: [],
    runRoomsEntered: 0,
    monstersSlain: 0,
    biggestKill: 0,
    bossesDefeated: [],
    // Decision funnels: per-sanctuary choices recorded for analytics. Like the
    // tallies above, they persist across descents and are snapshotted at run
    // end. boonPicks: { descent, offered[], picked }. forgeEdits:
    // { descent, type, offered[], chosen, skipped }.
    boonPicks: [],
    forgeEdits: [],
    // Per-descent timeline: one entry per descent, pushed at descend() and
    // finalized at the descent's end. { descent, themes[], startHp, maxHp,
    // endHp, roomsEntered, sigilEarned, outcome: 'cleared'|'died'|'retired' }.
    descents: [],

    // Per-descent transient charges (reset at descent start)
    riposteCharge: 0,
    secondWindUsed: false,
    cloakUsed: false,
    cloakArmed: false,
    twinSoulsUsed: false,
    cowardsRewardCharge: 0,
    numbRemaining: 0,
    mapPeek: null,
    // Rolling tail of the player's last 3 monster-kill ranks. Read by the
    // Devourer boss's dynamic rank (3 + sum). Resets per descent so the
    // sanctuary visit doesn't carry stale data into the next descent.
    lastKilledMonsterRanks: [],

    log: ['You wake in the great hall. The rune-chains hum.'],
  }
}

export function startNewRun(rng = Math.random, options = {}) {
  return createRun(rng, options)
}

// Change the run's mode. Only valid before the first descent (sigilsEarned 0,
// still in the opening sanctuary visit). Outside that window the mode is
// considered locked, and the call is a no-op.
export function setRunMode(state, modeId) {
  if (state.phase !== 'sanctuary') return state
  if (state.sigilsEarned !== 0) return state
  if (state.tutorial) return state
  // Guard on MODES, not getMode: getMode falls back to the default mode and so
  // never reports an unknown id, which let a junk mode string be stored on the
  // run and stamped into its history record.
  if (!MODES[modeId]) return state
  if (state.mode === modeId) return state
  return { ...state, mode: modeId }
}

// Change the run's ascension level. Same rules as setRunMode: pre-descent
// only. Clamping to the player's actual ceiling is the caller's job.
export function setRunAscension(state, level) {
  if (state.phase !== 'sanctuary') return state
  if (state.sigilsEarned !== 0) return state
  if (state.tutorial) return state
  const clamped = Math.max(0, Math.floor(level || 0))
  if (state.ascension === clamped) return state
  return { ...state, ascension: clamped }
}

// -- Descend ------------------------------------------------------------

export function descend(state) {
  if (state.phase !== 'sanctuary') return state
  if (!state.boonChosen) return state

  const themeId = state.nextTheme
  const themeChildren = state.nextThemeChildren
  const themes = themesFor(themeId, themeChildren)

  // Tutorial uses a hand-curated, unshuffled deck. Everything else
  // (theme effects, shuffle, etc) is skipped so the lesson hits each
  // card in the intended order.
  let deck, themeLog, themeDeckChanges
  if (state.tutorial) {
    deck = buildTutorialDeck()
    themeLog = []
    themeDeckChanges = []
  } else {
    const built = buildDescentDeck(state, themeId, themeChildren, state.rng)
    deck = built.deck.slice()
    themeLog = built.log
    themeDeckChanges = built.changes || []
  }
  const roomSize = getRoomSize(themes)
  const room = deck.splice(0, roomSize)

  // Wormwood mutes one random Boon for this descent. Decided first so the
  // mute is in effect when computeMaxHp reads Iron Will / Glass Cannon.
  let mutedBoon = null
  if (themeFlagAny(themes, 'wormwood') && state.boons.length > 0) {
    mutedBoon = state.boons[Math.floor(state.rng() * state.boons.length)]
  }
  const muteState = mutedBoon ? { ...state, mutedBoon } : state
  const maxHp = computeMaxHp(muteState, themeId, themeChildren)

  // Ascension hooks for descent start: A1 caps the starting HP below max so
  // the sanctuary stops being a free top-up; other levels' effects flow
  // through computeMaxHp / damage / picker code paths instead of here.
  const asc = getAscensionEffectsForState(state)
  const fullHeal = Math.max(1, Math.floor(maxHp * asc.sanctuaryHealMultiplier))
  // Stoic's first live descent (pick.descent, the descent right after it was
  // chosen) still takes a full sanctuary heal, topping up to the new (+10) max:
  // you start that descent at full (e.g. 30), so the bonus actually lands as
  // health. Only from the descent AFTER that does it forgo the heal, carrying
  // wounds between descents. hasBoon already reports false until Stoic is live
  // (see stoicActive / activeBoons); the first live descent has
  // sigilsEarned === pick.descent - 1, so carrying starts once sigilsEarned has
  // reached pick.descent. Read through muteState so a Wormwood-muted Stoic heals
  // normally.
  const stoicPick = (state.boonPicks || []).find(p => p.picked === 'stoic')
  const carriesWounds =
    hasBoon(muteState, 'stoic') && stoicPick && (state.sigilsEarned || 0) >= stoicPick.descent
  const startHp = carriesWounds ? Math.min(state.hp, maxHp) : fullHeal

  // Carried weapons arrive rested (lastSlain cleared). DESIGN.md §2.
  const weapon = state.carriedWeapon
    ? { rank: state.carriedWeapon.rank, originalRank: state.carriedWeapon.originalRank, lastSlain: null, ...(state.carriedWeapon.inscribed ? { inscribed: state.carriedWeapon.inscribed } : null) }
    : null
  const spareWeapon = state.carriedSpareWeapon
    ? { rank: state.carriedSpareWeapon.rank, originalRank: state.carriedSpareWeapon.originalRank, lastSlain: null, ...(state.carriedSpareWeapon.inscribed ? { inscribed: state.carriedSpareWeapon.inscribed } : null) }
    : null

  const baseTheme = getTheme(themeId)
  const baseLine = !baseTheme
    ? 'You descend. The dungeon is quiet tonight; the deep dream is still asleep.'
    : (themes.length > 1
        ? `You descend. ${baseTheme.name.toLowerCase()} is upon the halls: ${themes.map(t => t.name).join(' and ')}.`
        : `You descend. ${baseTheme.name.toLowerCase()} is upon the halls.`)

  const canFlee = !themeFlagAny(themes, 'cannotFlee')

  let descentState = {
    ...state,
    phase: 'descent',
    // The just-finished-tutorial acknowledgment is a one-shot for the opening
    // sanctuary; clear it as the player leaves that visit.
    tutorialJustFinished: false,
    hp: startHp,
    maxHp,
    deck,
    room,
    weapon,
    spareWeapon,
    potionsUsedThisRoom: 0,
    canFlee,
    discard: [],
    theme: themeId,
    themeChildren,
    themeDeckChanges,
    monstersFoughtThisRoom: 0,
    lastMonsterSuit: null,
    roomsEntered: 0,
    // Afflictions are per-descent; the sanctuary always wipes them clean.
    afflictions: {},
    vengefulBonus: 0,
    // Record the theme of this descent (tutorial walk excluded; it isn't a
    // real run leg). Run-level, so it accumulates across the whole run.
    themesFaced: state.tutorial ? (state.themesFaced || []) : [...(state.themesFaced || []), themeId],
    // Open a timeline entry for this descent (tutorial excluded, mirroring
    // themesFaced). Finalized by the descent's end state.
    descents: state.tutorial
      ? (state.descents || [])
      : [...(state.descents || []), {
          descent: (state.sigilsEarned || 0) + 1,
          themes: themes.map(t => t.id),
          startHp,
          maxHp,
          endHp: null,
          roomsEntered: 0,
          sigilEarned: false,
          outcome: null,
        }],
    mutedBoon,
    forgeOpen: false,
    forgeGrants: [],
    forgeGrantIndex: 0,
    forgeChoices: [],
    riposteCharge: 0,
    secondWindUsed: false,
    cloakUsed: false,
    cloakArmed: false,
    twinSoulsUsed: false,
    cowardsRewardCharge: 0,
    numbRemaining: 0,
    woundsAddedThisDescent: 0,
    pendingCursedHeal: 0,
    mapPeek: null,
    lastKilledMonsterRanks: [],
    log: [baseLine, ...themeLog],
  }

  if (mutedBoon) {
    descentState = appendLog(descentState,
      `Wormwood: ${BOONS[mutedBoon]?.name} falls silent this descent.`)
  }

  // Apply first-room entry effects with slot 0 as the "first new card".
  const entry = applyRoomEntryEffects(descentState, descentState.room, 0)
  if (entry.dead) return entry.state
  return { ...entry.state, room: entry.room }
}

// -- Run end states -----------------------------------------------------

// Patch the still-open (last) descent timeline entry with its outcome. No-op
// when there is no open descent (e.g. retiring from the sanctuary).
function finalizeDescent(descents, patch) {
  const d = descents || []
  if (d.length === 0) return d
  return [...d.slice(0, -1), { ...d[d.length - 1], ...patch }]
}

// Record where and how the run ended. `cause` carries the killing-blow detail
// the combat code knows (source, card, weapon); the situational context
// (which descent, theme, how deep) is derived from state here so call sites
// stay lean. Snapshotted into the stored record by buildRunRecord, then
// flattened into the run_ended analytics event.
export function endDescentDeath(state, cause = null) {
  const deathContext = {
    source: cause?.source || 'unknown',
    card: cause?.card || null,            // { suit, rank, effRank, boss }
    barehanded: cause?.barehanded ?? null,
    weaponRank: cause?.weaponRank ?? null,
    damage: cause?.damage ?? null,
    hpBefore: cause?.hpBefore ?? null,
    descent: (state.sigilsEarned || 0) + 1,
    theme: state.theme || null,
    themeChildren: state.themeChildren || null,
    roomsThisDescent: state.roomsEntered || 0,
    runRoomsEntered: state.runRoomsEntered || 0,
    monstersSlain: state.monstersSlain || 0,
    deckRemaining: (state.deck || []).length,
  }
  return appendLog(
    {
      ...state,
      phase: 'gameover',
      deathContext,
      descents: finalizeDescent(state.descents, {
        endHp: 0,
        roomsEntered: state.roomsEntered || 0,
        outcome: 'died',
      }),
    },
    'You fall in the dark. The hall above forgets you.'
  )
}

export function retireRun(state) {
  if (state.phase !== 'sanctuary' && state.phase !== 'descent') return state
  // Where the player chose to quit: a soft-death signal parallel to
  // deathContext. `phase` distinguishes giving up between descents (sanctuary)
  // from bailing mid-descent (descent). Snapshotted into the record as `retire`.
  const retireContext = {
    phase: state.phase,
    descent: (state.sigilsEarned || 0) + 1,
    sigilsEarned: state.sigilsEarned || 0,
    hp: state.hp || 0,
    maxHp: state.maxHp || 0,
    theme: state.theme || null,
    roomsThisDescent: state.roomsEntered || 0,
    runRoomsEntered: state.runRoomsEntered || 0,
    deckRemaining: (state.deck || []).length,
  }
  // Close the open descent only when quitting from within one; a sanctuary
  // retire has no open descent (the prior one cleared on return).
  const descents = state.phase === 'descent'
    ? finalizeDescent(state.descents, {
        endHp: state.hp || 0,
        roomsEntered: state.roomsEntered || 0,
        outcome: 'retired',
      })
    : (state.descents || [])
  return appendLog(
    { ...state, phase: 'gameover', retired: true, retireContext, descents },
    'You lay down your blade and walk back into the light.'
  )
}

export function endDescentVictory(state) {
  const carriedWeapon = state.weapon ? { rank: state.weapon.rank, originalRank: state.weapon.originalRank, ...(state.weapon.inscribed ? { inscribed: state.weapon.inscribed } : null) } : null
  const carriedSpareWeapon = state.spareWeapon ? { rank: state.spareWeapon.rank, originalRank: state.spareWeapon.originalRank, ...(state.spareWeapon.inscribed ? { inscribed: state.spareWeapon.inscribed } : null) } : null

  // Tutorial completion: no sigil earned, no boon offer, no forge,
  // and the tutorial weapon does not carry into The Quiet. The
  // player starts that descent bare-handed, same as a real opening
  // run. Drop the tutorial flag, queue The Quiet, return to sanctuary
  // as an opening-style visit (boonChosen=true since no boon to pick).
  if (state.tutorial) {
    return appendLog(
      {
        ...state,
        tutorial: false,
        // One-shot flag so the first real sanctuary can acknowledge the hand-off
        // (the guided walk is over; the dungeon stops holding your hand). Cleared
        // when the player descends into The Quiet.
        tutorialJustFinished: true,
        phase: 'sanctuary',
        carriedWeapon: null,
        carriedSpareWeapon: null,
        nextTheme: 'the_quiet',
        nextThemeChildren: null,
        boonOffers: [],
        boonChosen: true,
        forgeOpen: false,
        forgeGrants: [],
        forgeGrantIndex: 0,
        forgeChoices: [],
        forgeInscribedIds: [],
        deck: [],
        room: [],
        theme: null,
        themeChildren: null,
        themeDeckChanges: [],
      },
      'The walk is done. The Quiet waits below.'
    )
  }

  // The descent just cleared: close its timeline entry. Shared by both the
  // winning-sigil (victory) and the normal sanctuary-return paths below.
  const clearedDescents = finalizeDescent(state.descents, {
    endHp: state.hp,
    roomsEntered: state.roomsEntered || 0,
    sigilEarned: true,
    outcome: 'cleared',
  })

  const newSigils = state.sigilsEarned + 1

  const rng = state.rng
  // Discovery: each sigil earned permanently unlocks one random Boon from
  // the locked pool, if any are still locked. The unlock applies even in
  // Hardcore (no offers seen this run, but the library grows for next time)
  // and on the winning sigil (sigil 7), so a clean run delivers 7 unlocks.
  const currentLibrary = state.unlockedBoons || STARTER_BOON_IDS
  const unlockedSet = new Set(currentLibrary)
  const stillLocked = UNLOCKABLE_BOON_IDS.filter(id => !unlockedSet.has(id))
  let nextLibrary = currentLibrary
  let discoveredBoonId = null
  if (stillLocked.length > 0) {
    discoveredBoonId = stillLocked[Math.floor(rng() * stillLocked.length)]
    nextLibrary = currentLibrary.concat(discoveredBoonId)
  }

  if (newSigils >= state.sigilTarget) {
    let won = {
      ...state,
      sigilsEarned: newSigils,
      phase: 'victory',
      carriedWeapon,
      carriedSpareWeapon,
      unlockedBoons: nextLibrary,
      descents: clearedDescents,
    }
    won = appendLog(won, 'The final sigil is set in the threshold. The high gate opens.')
    if (discoveredBoonId) {
      const boon = BOONS[discoveredBoonId]
      won = appendLog(won, `Discovered a new Boon: ${boon?.name || discoveredBoonId}.`)
    }
    return won
  }

  const mode = isFlagEnabled('modes') ? getMode(state.mode) : getMode(DEFAULT_MODE)
  const asc = getAscensionEffectsForState(state)
  const forgeSigilSet = new Set(asc.forgeSigils)

  // Ascension hooks: themeTierOffset advances the escalation by N sigils so
  // harder themes show up sooner; boonOfferCount caps the offer roll;
  // forgeSigils swaps the A0 every-return cadence for the level's set.
  //
  // Mode hooks: lockTheme overrides the rolled theme; noBoons skips the
  // offer roll; noForge keeps the forge closed regardless of sigil count.
  // themesFaced holds every theme rolled this run (descend() pushes the
  // descent's theme as it starts, so the one just cleared is already in it).
  // Passing the whole list keeps a Trial from coming back later in the run,
  // not merely on the next descent. The Long Night's children are picked
  // separately and are not constrained by it.
  const nextTheme = mode.lockTheme || pickThemeId(rng, newSigils + asc.themeTierOffset, state.themesFaced)
  const nextThemeChildren = resolveThemeChildren(nextTheme, rng)
  // Library flag off: every Boon is available, the per-player unlocked set
  // is ignored. Discoveries still get appended to state (cheap, and the
  // library stays warm in case the flag flips back on later).
  const offerPool = isFlagEnabled('library') ? nextLibrary : UNLOCKABLE_BOON_IDS
  const boonOffers = mode.noBoons ? [] : pickBoonOffers(state.boons, asc.boonOfferCount, rng, offerPool)
  const boonChosen = mode.noBoons // no boon to pick in modes that skip offers
  const forgeOpen = !mode.noForge && forgeSigilSet.has(newSigils)
  // When the forge opens, roll the visit's granted edit batch and the first
  // edit's card choices. Empty when the forge is closed.
  const forgeGrants = forgeOpen ? rollForgeGrants(state.kit, newSigils, rng) : []
  const { forgeGrantIndex, forgeChoices } = forgeGrants.length > 0
    ? initForgeBatch(forgeGrants, state.kit, newSigils, rng)
    : { forgeGrantIndex: 0, forgeChoices: [] }

  let returned = {
    ...state,
    sigilsEarned: newSigils,
    phase: 'sanctuary',
    carriedWeapon,
    carriedSpareWeapon,
    descents: clearedDescents,
    nextTheme,
    nextThemeChildren,
    boonOffers,
    forgeOpen,
    boonChosen,
    forgeGrants,
    forgeGrantIndex,
    forgeChoices,
    // Fresh visit: nothing inscribed yet, so the whole kit is upgradeable.
    forgeInscribedIds: [],
    unlockedBoons: nextLibrary,

    // Wipe descent-only state
    deck: [],
    room: [],
    theme: null,
    themeChildren: null,
    themeDeckChanges: [],
    weapon: null,
    spareWeapon: null,
    discard: [],
    potionsUsedThisRoom: 0,
    monstersFoughtThisRoom: 0,
    lastMonsterSuit: null,
    roomsEntered: 0,
    afflictions: {},
    mutedBoon: null,
    riposteCharge: 0,
    secondWindUsed: false,
    cloakUsed: false,
    cloakArmed: false,
    twinSoulsUsed: false,
    cowardsRewardCharge: 0,
    numbRemaining: 0,
    woundsAddedThisDescent: 0,
    pendingCursedHeal: 0,
    mapPeek: null,
    lastKilledMonsterRanks: [],
  }
  returned = appendLog(
    returned,
    `You return to the hall. Sigil ${newSigils} of ${state.sigilTarget} is set.`
  )
  if (discoveredBoonId) {
    const boon = BOONS[discoveredBoonId]
    returned = appendLog(returned, `Discovered a new Boon: ${boon?.name || discoveredBoonId}.`)
  }
  return returned
}

// -- Flee --------------------------------------------------------------

// Oath marks the "first new card" of a room face-down. When a flee sends the
// room back to the bottom of the deck, that flag has to come off, or the card
// stays face-down on its next redraw and stacks with the new room's Oath card.
function stripFaceDown(card) {
  if (!card || !card.faceDown) return card
  const { faceDown: _faceDown, ...rest } = card
  return rest
}

// Pick the best card to "pocket" when fleeing: highest-rank item (weapon or
// potion), or the lowest-rank monster if no items remain.
function pickPocketTarget(room) {
  const items = room.filter(c => c && (isWeapon(c) || isPotion(c)))
  if (items.length > 0) {
    return items.reduce((a, b) => (b.rank > a.rank ? b : a))
  }
  const monsters = room.filter(c => c && isMonster(c))
  if (monsters.length > 0) {
    return monsters.reduce((a, b) => (b.rank < a.rank ? b : a))
  }
  return null
}

export function fleeRoom(state) {
  if (state.phase !== 'descent') return state
  if (!state.canFlee) return state
  // A warded monster pins you in the room.
  if ((state.room || []).some(c => c && c.warded)) return state
  const themes = themesFor(state.theme, state.themeChildren)
  if (themeFlagAny(themes, 'cannotFlee')) return state

  // Scoundrel's Cloak lets you flee two rooms in a row, once per descent. The
  // charge is only spent on the *second* consecutive flee: the first flee arms
  // the cloak (keeping flee available), and clearing a room in between disarms
  // it (in checkRefillAndComplete) so the charge survives for a real chain.
  const cloakConsecutive = state.cloakArmed === true
  const armCloak = hasBoon(state, 'scoundrels_cloak') && !state.cloakUsed && !cloakConsecutive
  const cloakNote = armCloak
    ? " (Scoundrel's Cloak: you can flee again.)"
    : cloakConsecutive
      ? " (Scoundrel's Cloak spent: your second flee.)"
      : ''
  const targetSize = getRoomSize(themes)
  // Coward's Reward: each flee banks +1 on your next opening swing (cap 3).
  const cowardsCharge = hasBoon(state, 'cowards_reward')
    ? Math.min(3, (state.cowardsRewardCharge || 0) + 1)
    : (state.cowardsRewardCharge || 0)

  if (hasBoon(state, 'pickpocket')) {
    const filled = state.room.filter(Boolean)
    const kept = pickPocketTarget(filled)
    const keptIndex = kept ? state.room.findIndex(c => c && c.id === kept.id) : -1
    const others = kept ? filled.filter(c => c.id !== kept.id) : filled
    const deck = state.deck.concat(others.map(stripFaceDown))

    const newRoom = new Array(targetSize).fill(null)
    if (kept && keptIndex >= 0 && keptIndex < targetSize) newRoom[keptIndex] = kept
    let firstNewIdx = null
    for (let i = 0; i < newRoom.length; i++) {
      if (newRoom[i] === null && deck.length > 0) {
        newRoom[i] = deck.shift()
        if (firstNewIdx === null) firstNewIdx = i
      }
    }

    const note = kept
      ? `You retreat, palmed ${rankLabel(kept.rank)}${SUIT_GLYPH[kept.suit]} on the way out.`
      : 'You retreat. The room scatters back into the dark.'
    let next = appendLog(
      {
        ...state,
        deck,
        room: newRoom,
        canFlee: armCloak,
        cloakUsed: cloakConsecutive ? true : state.cloakUsed,
        cloakArmed: armCloak,
        potionsUsedThisRoom: 0,
        monstersFoughtThisRoom: 0,
        cowardsRewardCharge: cowardsCharge,
      },
      `${note}${cloakNote}`
    )
    if (hasBoon(next, 'cowards_reward')) {
      next = appendLog(next, `Coward's Reward: opening swing banked at +${cowardsCharge}.`)
    }

    const entry = applyRoomEntryEffects(next, next.room, firstNewIdx)
    if (entry.dead) return entry.state
    return { ...entry.state, room: entry.room }
  }

  const carry = state.room.filter(Boolean).map(stripFaceDown)
  const deck = state.deck.concat(carry)
  const room = deck.splice(0, targetSize)

  let next = appendLog(
    {
      ...state,
      deck,
      room,
      canFlee: armCloak,
      cloakUsed: cloakConsecutive ? true : state.cloakUsed,
      cloakArmed: armCloak,
      potionsUsedThisRoom: 0,
      monstersFoughtThisRoom: 0,
      cowardsRewardCharge: cowardsCharge,
    },
    `You retreat. The room scatters back into the dark.${cloakNote}`
  )
  if (hasBoon(next, 'cowards_reward')) {
    next = appendLog(next, `Coward's Reward: opening swing banked at +${cowardsCharge}.`)
  }
  next = markTutorialLesson(next, 'flee')

  const entry = applyRoomEntryEffects(next, next.room, 0)
  if (entry.dead) return entry.state
  return { ...entry.state, room: entry.room }
}
