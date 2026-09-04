// Run lifecycle: the state transitions between sanctuary and descent
// (issue 15, priority 3).
//
// Nothing here mocks anything. `createRun` takes an injected rng, and every
// transition is a pure function over the state it returns, so a test can walk
// a whole run deterministically.

import { describe, it, expect } from 'vitest'
import {
  createRun, startNewRun, setRunMode, setRunAscension,
  descend, endDescentVictory, endDescentDeath, retireRun, fleeRoom,
} from '../src/games/scoundrel/logic/lifecycle'
import { getAscensionEffects, ASCENSION_MAX } from '../src/games/scoundrel/ascensions'
import { UNLOCKABLE_BOON_IDS } from '../src/games/scoundrel/boons'
import { SIGIL_TARGET, ROOM_SIZE, BASE_MAX_HP, DIAMOND, HEART } from '../src/games/scoundrel/constants'
import { descentState, roomOf, seededRng, spade, club, weaponCard, potionCard } from './support/state'

const newRun = (seed = 1, options) => createRun(seededRng(seed), options)

describe('createRun', () => {
  it('opens in the sanctuary with nothing to choose', () => {
    const run = newRun()
    expect(run.phase).toBe('sanctuary')
    expect(run.sigilsEarned).toBe(0)
    expect(run.sigilTarget).toBe(SIGIL_TARGET)
    // The opening visit has no Boon offer and no Forge, so boonChosen starts
    // true or descend() would refuse to let the player leave.
    expect(run.boonChosen).toBe(true)
    expect(run.boonOffers).toEqual([])
    expect(run.forgeOpen).toBe(false)
    expect(run.forgeGrants).toEqual([])
  })

  it('queues The Quiet for descent 1', () => {
    expect(newRun().nextTheme).toBe('the_quiet')
    expect(newRun().nextThemeChildren).toBeNull()
    expect(newRun().theme).toBeNull()
  })

  it('seeds the kit with the low ten and nothing else', () => {
    const kit = newRun().kit
    expect(kit).toHaveLength(10)
    expect(kit.filter(c => c.suit === DIAMOND).map(c => c.rank)).toEqual([2, 3, 4, 5, 6])
    expect(kit.filter(c => c.suit === HEART).map(c => c.rank)).toEqual([2, 3, 4, 5, 6])
    expect(newRun().kitEdits).toBe(0)
  })

  it('leaves HP and the deck unset until the first descend', () => {
    const run = newRun()
    expect(run.hp).toBe(0)
    expect(run.maxHp).toBe(0)
    expect(run.deck).toEqual([])
    expect(run.room).toEqual([])
  })

  it('mints a run seed so two devices cannot collide on a startedAt', () => {
    const run = newRun()
    expect(typeof run.runSeed).toBe('string')
    expect(run.runSeed.length).toBeGreaterThan(0)
    expect(newRun().runSeed).not.toBe(run.runSeed)
  })

  it('starts every run-level tally at zero', () => {
    const run = newRun()
    expect(run).toMatchObject({
      runRoomsEntered: 0, monstersSlain: 0, biggestKill: 0, pausedMs: 0, pausedAt: null,
    })
    for (const k of ['themesFaced', 'bossesDefeated', 'boonPicks', 'forgeEdits', 'descents', 'boons']) {
      expect(run[k]).toEqual([])
    }
  })

  it('routes a tutorial run through the curated walk instead', () => {
    const run = newRun(1, { tutorial: true })
    expect(run.tutorial).toBe(true)
    expect(run.nextTheme).toBe('tutorial')
    expect(run.tutorialLessons).toEqual([])
  })

  it('takes the mode, ascension and boon library from its options', () => {
    const run = newRun(1, { mode: 'hardcore', ascension: 3, unlockedBoons: ['numb'] })
    expect(run.mode).toBe('hardcore')
    expect(run.ascension).toBe(3)
    expect(run.unlockedBoons).toEqual(['numb'])
  })

  it('copies the boon library rather than aliasing the caller\'s array', () => {
    const library = ['numb']
    const run = newRun(1, { unlockedBoons: library })
    run.unlockedBoons.push('vanguard')
    expect(library).toEqual(['numb'])
  })

  it('startNewRun is the same thing', () => {
    expect(startNewRun(seededRng(1)).nextTheme).toBe(createRun(seededRng(1)).nextTheme)
  })
})

describe('setRunMode / setRunAscension', () => {
  it('changes the mode before the first descent', () => {
    expect(setRunMode(newRun(), 'hardcore').mode).toBe('hardcore')
  })

  it('locks once the run is under way', () => {
    const midRun = { ...newRun(), sigilsEarned: 1 }
    expect(setRunMode(midRun, 'hardcore')).toBe(midRun)
    const inDescent = { ...newRun(), phase: 'descent' }
    expect(setRunMode(inDescent, 'hardcore')).toBe(inDescent)
  })

  it('refuses during the tutorial', () => {
    const tut = newRun(1, { tutorial: true })
    expect(setRunMode(tut, 'hardcore')).toBe(tut)
  })

  it('refuses an unknown mode rather than storing it', () => {
    // getMode falls back to the default mode for an unknown id, so the guard
    // has to read MODES directly or a junk string ends up on the run record.
    const run = newRun()
    expect(setRunMode(run, 'no_such_mode')).toBe(run)
    expect(setRunMode(run, 'no_such_mode').mode).toBe('default')
  })

  it('is a no-op when the mode is already set', () => {
    const run = newRun()
    expect(setRunMode(run, 'default')).toBe(run)
  })

  it('floors and clamps the ascension level at zero', () => {
    expect(setRunAscension(newRun(), 3.9).ascension).toBe(3)
    expect(setRunAscension(newRun(), -5).ascension).toBe(0)
    const run = newRun()
    expect(setRunAscension(run, 0)).toBe(run)
  })
})

describe('descend', () => {
  const firstDescent = (seed = 1) => descend(newRun(seed))

  it('refuses outside the sanctuary or with a Boon still unchosen', () => {
    const inDescent = { ...newRun(), phase: 'descent' }
    expect(descend(inDescent)).toBe(inDescent)
    const owing = { ...newRun(), boonChosen: false }
    expect(descend(owing)).toBe(owing)
  })

  it('deals a full room and leaves the rest as the deck', () => {
    const s = firstDescent()
    expect(s.phase).toBe('descent')
    expect(s.room).toHaveLength(ROOM_SIZE)
    expect(s.room.every(Boolean)).toBe(true)
    // The Quiet's deck is the 16 base monsters plus the ten-card kit.
    expect(s.deck).toHaveLength(26 - ROOM_SIZE)
  })

  it('opens at full HP, with The Quiet\'s +10', () => {
    const s = firstDescent()
    expect(s.maxHp).toBe(BASE_MAX_HP + 10)
    expect(s.hp).toBe(s.maxHp)
  })

  it('counts the opening room as entered', () => {
    const s = firstDescent()
    expect(s.roomsEntered).toBe(1)
    expect(s.runRoomsEntered).toBe(1)
  })

  it('opens a timeline entry and records the theme faced', () => {
    const s = firstDescent()
    expect(s.themesFaced).toEqual(['the_quiet'])
    expect(s.descents).toHaveLength(1)
    expect(s.descents[0]).toMatchObject({
      descent: 1, themes: ['the_quiet'], startHp: 30, maxHp: 30, endHp: null,
      sigilEarned: false, outcome: null,
    })
  })

  it('wipes the sanctuary state the descent must not see', () => {
    const s = descend({ ...newRun(), forgeOpen: true, forgeGrants: ['inscribe'], forgeChoices: [weaponCard(4)] })
    expect(s.forgeOpen).toBe(false)
    expect(s.forgeGrants).toEqual([])
    expect(s.forgeChoices).toEqual([])
    expect(s.afflictions).toEqual({})
    expect(s.discard).toEqual([])
  })

  it('resets every per-descent charge', () => {
    const spent = {
      ...newRun(),
      riposteCharge: 3, secondWindUsed: true, cloakUsed: true, cloakArmed: true,
      twinSoulsUsed: true, cowardsRewardCharge: 3, numbRemaining: 2,
      lastKilledMonsterRanks: [9, 9, 9], mapPeek: [weaponCard(3)],
    }
    expect(descend(spent)).toMatchObject({
      riposteCharge: 0, secondWindUsed: false, cloakUsed: false, cloakArmed: false,
      twinSoulsUsed: false, cowardsRewardCharge: 0, numbRemaining: 0,
      lastKilledMonsterRanks: [], mapPeek: null, woundsAddedThisDescent: 0,
    })
  })

  it('hands back a carried weapon rested, with its binding cleared', () => {
    const s = descend({
      ...newRun(),
      carriedWeapon: { rank: 8, originalRank: 8, inscribed: 'vampiric_edge' },
      carriedSpareWeapon: { rank: 5, originalRank: 5 },
    })
    expect(s.weapon).toEqual({ rank: 8, originalRank: 8, lastSlain: null, inscribed: 'vampiric_edge' })
    expect(s.spareWeapon).toEqual({ rank: 5, originalRank: 5, lastSlain: null })
  })

  it('starts bare-handed with nothing carried', () => {
    const s = firstDescent()
    expect(s.weapon).toBeNull()
    expect(s.spareWeapon).toBeNull()
  })

  it('is deterministic under a seeded rng', () => {
    expect(firstDescent(7).deck.map(c => c.id)).toEqual(firstDescent(7).deck.map(c => c.id))
    expect(firstDescent(8).deck.map(c => c.id)).not.toEqual(firstDescent(7).deck.map(c => c.id))
  })

  it('walks the tutorial deck unshuffled and keeps it off the run record', () => {
    const s = descend(newRun(1, { tutorial: true }))
    expect(s.room.map(c => c.id)).toEqual(['tut_d5', 'tut_c3', 'tut_h2', 'tut_s7'])
    expect(s.deck).toHaveLength(22 - ROOM_SIZE)
    // The walk is not a real leg of the run.
    expect(s.themesFaced).toEqual([])
    expect(s.descents).toEqual([])
  })
})

describe('endDescentVictory', () => {
  const cleared = (over = {}) => endDescentVictory({
    ...descend(newRun(3)),
    hp: 21,
    ...over,
  })

  it('sets a sigil and returns to the sanctuary', () => {
    const s = cleared()
    expect(s.phase).toBe('sanctuary')
    expect(s.sigilsEarned).toBe(1)
    expect(s.log.join(' ')).toContain(`Sigil 1 of ${SIGIL_TARGET}`)
  })

  it('closes the descent timeline entry as cleared', () => {
    const s = cleared()
    expect(s.descents).toHaveLength(1)
    expect(s.descents[0]).toMatchObject({ endHp: 21, sigilEarned: true, outcome: 'cleared' })
  })

  it('carries the weapons forward as bare rank descriptors', () => {
    const s = cleared({
      weapon: { rank: 7, originalRank: 6, lastSlain: { rank: 5 }, strengthBonus: 4, inscribed: 'wildedge' },
      spareWeapon: { rank: 3, originalRank: 3, lastSlain: { rank: 2 } },
    })
    // Only rank / originalRank / inscribed survive; the binding and the
    // weapon-borne Strength bonus are left behind in the descent.
    expect(s.carriedWeapon).toEqual({ rank: 7, originalRank: 6, inscribed: 'wildedge' })
    expect(s.carriedSpareWeapon).toEqual({ rank: 3, originalRank: 3 })
    expect(s.weapon).toBeNull()
    expect(s.spareWeapon).toBeNull()
  })

  it('wipes every descent-only field', () => {
    const s = cleared({ afflictions: { sealed: 2 }, mutedBoon: 'numb', mapPeek: [weaponCard(2)] })
    expect(s).toMatchObject({
      deck: [], room: [], theme: null, themeChildren: null, discard: [],
      afflictions: {}, mutedBoon: null, mapPeek: null, roomsEntered: 0,
      lastKilledMonsterRanks: [], forgeInscribedIds: [],
    })
  })

  it('opens the Forge with a rolled batch and a live offer', () => {
    const s = cleared()
    expect(s.forgeOpen).toBe(true)
    expect(s.forgeGrants.length).toBeGreaterThan(0)
    expect(s.forgeChoices.length).toBeGreaterThan(0)
    expect(s.forgeGrantIndex).toBe(0)
  })

  it('opens the Forge on every return, including the last two (issue 29)', () => {
    // The A0 default used to be a hand-written [1..7], so returns at 8 and 9
    // sigils silently found the Forge closed -- in the hardest band of the run.
    for (let sigils = 1; sigils < SIGIL_TARGET; sigils += 1) {
      const s = cleared({ sigilsEarned: sigils - 1 })
      expect(s.sigilsEarned, 'returned with the sigil just earned').toBe(sigils)
      expect(s.phase).toBe('sanctuary')
      expect(s.forgeOpen, `Forge open on the return at ${sigils} sigils`).toBe(true)
      expect(s.forgeGrants.length, `a batch to spend at ${sigils} sigils`).toBeGreaterThan(0)
    }
  })

  it('offers Boons the player must choose from before descending again', () => {
    const s = cleared()
    expect(s.boonChosen).toBe(false)
    expect(s.boonOffers).toHaveLength(3)
    expect(new Set(s.boonOffers).size).toBe(3)
    expect(descend(s)).toBe(s)
  })

  it('queues a theme for the next descent that is not the one just faced', () => {
    const s = cleared()
    expect(s.nextTheme).toBeTruthy()
    expect(s.themesFaced).not.toContain(s.nextTheme)
  })

  it('unlocks one Boon per sigil while any are still locked', () => {
    const s = endDescentVictory({ ...descend(newRun(3)), unlockedBoons: ['numb'] })
    expect(s.unlockedBoons).toHaveLength(2)
    expect(s.unlockedBoons[0]).toBe('numb')
    expect(s.log.join(' ')).toContain('Discovered a new Boon')
  })

  it('leaves the library alone once everything is unlocked', () => {
    const s = endDescentVictory({
      ...descend(newRun(3)),
      unlockedBoons: UNLOCKABLE_BOON_IDS.slice(),
    })
    expect(s.unlockedBoons).toHaveLength(UNLOCKABLE_BOON_IDS.length)
    expect(s.log.join(' ')).not.toContain('Discovered a new Boon')
  })

  it('ends the run in victory on the target sigil', () => {
    const s = endDescentVictory({ ...descend(newRun(3)), sigilsEarned: SIGIL_TARGET - 1 })
    expect(s.phase).toBe('victory')
    expect(s.sigilsEarned).toBe(SIGIL_TARGET)
    expect(s.log.join(' ')).toContain('The high gate opens')
  })

  it('finishing the tutorial earns no sigil and hands off to The Quiet', () => {
    const s = endDescentVictory(descend(newRun(1, { tutorial: true })))
    expect(s.phase).toBe('sanctuary')
    expect(s.tutorial).toBe(false)
    expect(s.tutorialJustFinished).toBe(true)
    expect(s.sigilsEarned).toBe(0)
    expect(s.nextTheme).toBe('the_quiet')
    expect(s.boonOffers).toEqual([])
    expect(s.forgeOpen).toBe(false)
    // The tutorial blade does not come with you.
    expect(s.carriedWeapon).toBeNull()
  })

  it('clears the tutorial hand-off flag as the player leaves the hall', () => {
    const handed = endDescentVictory(descend(newRun(1, { tutorial: true })))
    expect(descend(handed).tutorialJustFinished).toBe(false)
  })
})

describe('endDescentDeath', () => {
  it('closes the timeline entry as died and ends the run', () => {
    const s = endDescentDeath({ ...descend(newRun(3)), hp: 0, roomsEntered: 5 })
    expect(s.phase).toBe('gameover')
    expect(s.descents[0]).toMatchObject({ endHp: 0, roomsEntered: 5, outcome: 'died' })
  })

  it('records unknown for a death with no attributed cause', () => {
    const s = endDescentDeath(descend(newRun(3)))
    expect(s.deathContext.source).toBe('unknown')
    expect(s.deathContext.card).toBeNull()
  })
})

describe('retireRun', () => {
  it('closes an open descent when quitting mid-run', () => {
    const s = retireRun({ ...descend(newRun(3)), hp: 12, roomsEntered: 4 })
    expect(s.phase).toBe('gameover')
    expect(s.retired).toBe(true)
    expect(s.retireContext).toMatchObject({ phase: 'descent', hp: 12, roomsThisDescent: 4 })
    expect(s.descents[0]).toMatchObject({ endHp: 12, outcome: 'retired' })
  })

  it('leaves the timeline alone when quitting from the sanctuary', () => {
    const sanctuary = endDescentVictory({ ...descend(newRun(3)), hp: 20 })
    const s = retireRun(sanctuary)
    expect(s.retireContext.phase).toBe('sanctuary')
    expect(s.descents[0].outcome).toBe('cleared')
  })

  it('refuses once the run is already over', () => {
    const over = { ...newRun(), phase: 'gameover' }
    expect(retireRun(over)).toBe(over)
  })
})

describe('fleeRoom', () => {
  const fleeable = (over = {}) => descentState({
    deck: [spade(2), spade(3), spade(4), spade(5), spade(6)],
    room: roomOf(spade(13), club(12), potionCard(9), weaponCard(8)),
    ...over,
  })

  it('sends the room to the bottom of the deck and deals a fresh one', () => {
    const s = fleeRoom(fleeable())
    expect(s.room.map(c => c.id)).toEqual(['S2', 'S3', 'S4', 'S5'])
    expect(s.deck.map(c => c.id)).toEqual(['S6', 'S13', 'C12', 'H9', 'D8'])
  })

  it('resets the per-room counters', () => {
    const s = fleeRoom(fleeable({ potionsUsedThisRoom: 1, monstersFoughtThisRoom: 2 }))
    expect(s.potionsUsedThisRoom).toBe(0)
    expect(s.monstersFoughtThisRoom).toBe(0)
    expect(s.roomsEntered).toBe(1)
  })

  it('spends the descent\'s one flee by default', () => {
    const s = fleeRoom(fleeable())
    expect(s.canFlee).toBe(false)
    expect(fleeRoom(s)).toBe(s)
  })

  it('refuses outside a descent, and with a warded monster in the room', () => {
    const sanctuary = fleeable({ phase: 'sanctuary' })
    expect(fleeRoom(sanctuary)).toBe(sanctuary)
    const pinned = fleeable({ room: roomOf(spade(13, { warded: true }), club(12), potionCard(9), weaponCard(8)) })
    expect(fleeRoom(pinned)).toBe(pinned)
  })

  it("Scoundrel's Cloak arms on the first flee and is spent on the second", () => {
    const first = fleeRoom(fleeable({ boons: ['scoundrels_cloak'] }))
    expect(first.canFlee).toBe(true)
    expect(first.cloakArmed).toBe(true)
    expect(first.cloakUsed).toBe(false)

    const second = fleeRoom(first)
    expect(second.cloakUsed).toBe(true)
    expect(second.canFlee).toBe(false)
  })

  it("Coward's Reward banks a charge per flee, capped at 3", () => {
    let s = fleeable({ boons: ['cowards_reward', 'scoundrels_cloak'] })
    const charges = []
    for (let i = 0; i < 4; i++) {
      s = fleeRoom({ ...s, canFlee: true })
      charges.push(s.cowardsRewardCharge)
    }
    expect(charges).toEqual([1, 2, 3, 3])
  })

  it('Pickpocket palms the highest-rank item out of the room', () => {
    const s = fleeRoom(fleeable({ boons: ['pickpocket'] }))
    // The 9♥ outranks the 8♦; both monsters go back to the deck.
    expect(s.room.map(c => c.id)).toContain('H9')
    expect(s.deck.map(c => c.id)).toContain('S13')
  })

  it('Pickpocket falls back to the weakest monster with no items in the room', () => {
    const s = fleeRoom(fleeable({
      boons: ['pickpocket'],
      room: roomOf(spade(13), club(12), spade(4), club(9)),
    }))
    expect(s.room.map(c => c.id)).toContain('S4')
  })

  it('strips the Oath face-down marker from cards it sends back', () => {
    const s = fleeRoom(fleeable({
      room: roomOf(spade(13, { faceDown: true }), club(12), potionCard(9), weaponCard(8)),
    }))
    const returned = s.deck.find(c => c.id === 'S13')
    expect(returned.faceDown).toBeUndefined()
  })
})

describe('getAscensionEffects', () => {
  it('is the base game at level 0', () => {
    expect(getAscensionEffects(0)).toMatchObject({
      level: 0, sanctuaryHealMultiplier: 1, boonOfferCount: 3, themeTierOffset: 0,
      maxHpBonus: 0, faceCardRankBonus: 0,
    })
    // The Forge opens on every return, which is every sigil short of the
    // target -- the last descent ends the run rather than returning.
    expect(getAscensionEffects(0).forgeSigils)
      .toEqual(Array.from({ length: SIGIL_TARGET - 1 }, (_, i) => i + 1))
  })

  it('stacks every level below the requested one', () => {
    const a6 = getAscensionEffects(6)
    expect(a6).toMatchObject({
      level: 6,
      sanctuaryHealMultiplier: 0.9, // A1
      boonOfferCount: 2,            // A2
      themeTierOffset: 1,           // A3
      maxHpBonus: -2,               // A5
      faceCardRankBonus: 1,         // A6
    })
    // A4 (Cold Coals) names its two sigils in its description, so it stays a
    // literal pair -- it must not widen with SIGIL_TARGET the way A0 does.
    expect(a6.forgeSigils).toEqual([3, 5])       // A4
    expect(getAscensionEffects(4).forgeSigils).toEqual([3, 5])
  })

  it('clamps out-of-range levels', () => {
    expect(getAscensionEffects(-3).level).toBe(0)
    expect(getAscensionEffects(999).level).toBe(ASCENSION_MAX)
    expect(getAscensionEffects(undefined).level).toBe(0)
  })
})
