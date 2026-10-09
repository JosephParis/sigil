// Run seeds (issue 38): the same seed plays the same dungeon for anyone who
// enters it, and a player's choices cannot shift the parts that should match.
//
// Each walk below gives the run a *different* fallback rng from the seed it is
// playing, so a test passes only if the seed, not the rng, decided the roll.

import { describe, it, expect } from 'vitest'
import {
  createRun, setRunSeed, setRunMode, descend, endDescentVictory,
} from '../src/games/scoundrel/logic/lifecycle'
import { pickBoon, applyForgeEdit, skipForgeEdit, forgeActive } from '../src/games/scoundrel/logic/sanctuary'
import { isMonster } from '../src/games/scoundrel/constants'
import { buildRunRecord } from '../src/games/scoundrel/history'
import {
  newSeed, normalizeSeed, formatSeed, streamFor, rngFor, playRoll, seedLink, SEED_LENGTH,
} from '../src/games/scoundrel/seed'
import { seededRng } from './support/state'

const SEED = 'K7Q2M9XD'

// A card as the player sees it. Card ids carry a counter and a timestamp
// (constants.js) so two games never mint the same one; they are labels, not
// part of the dungeon, and are left out of the comparison.
const face = card => {
  const { id: _id, ...rest } = card
  return JSON.stringify(rest)
}

// Walk `descents` descents, clearing each outright. `choose` decides what the
// player does at each sanctuary: which offered Boon to take, and whether to
// take the first Forge choice or skip.
function walk(seed, rngSeed, descents, choose = () => ({ boon: 0, forge: true })) {
  let s = createRun(seededRng(rngSeed), { seed })
  const seen = []
  for (let d = 1; d <= descents; d++) {
    s = descend(s)
    seen.push({
      theme: s.theme,
      themeChildren: s.themeChildren,
      deck: [...s.room, ...s.deck].map(face),
      monsters: [...s.room, ...s.deck].filter(isMonster).map(face).sort(),
    })
    s = endDescentVictory(s)
    const pick = choose(d)
    if (s.boonOffers.length > 0) {
      seen[seen.length - 1].offers = s.boonOffers.slice()
      s = pickBoon(s, s.boonOffers[pick.boon % s.boonOffers.length])
    }
    seen[seen.length - 1].forge = (s.forgeGrants || []).slice()
    seen[seen.length - 1].forgeChoices = (s.forgeChoices || []).map(face)
    while (forgeActive(s)) {
      s = pick.forge ? applyForgeEdit(s, s.forgeChoices[0].id) : skipForgeEdit(s)
    }
  }
  return { state: s, seen }
}

describe('seed codes', () => {
  it('mints readable codes of the expected length', () => {
    for (let i = 0; i < 50; i++) {
      const code = newSeed()
      expect(code).toHaveLength(SEED_LENGTH)
      expect(normalizeSeed(code)).toBe(code)
      expect(code).not.toMatch(/[ILOU]/)
    }
  })

  it('reads a code back however it was typed', () => {
    expect(normalizeSeed('k7q2-m9xd')).toBe(SEED)
    expect(normalizeSeed(' K7Q2 M9XD ')).toBe(SEED)
    expect(formatSeed(SEED)).toBe('K7Q2-M9XD')
    expect(normalizeSeed(formatSeed(SEED))).toBe(SEED)
    // The letters Crockford leaves out read as the digits they get mistaken for.
    expect(normalizeSeed('OOOO-ILIL')).toBe('00001111')
  })

  it('refuses what cannot be a seed', () => {
    expect(normalizeSeed('')).toBeNull()
    expect(normalizeSeed('K7Q2M9X')).toBeNull()
    expect(normalizeSeed('K7Q2M9XDZ')).toBeNull()
    expect(normalizeSeed('K7Q2M9X!')).toBeNull()
    expect(normalizeSeed('K7Q2M9XU')).toBeNull()
    expect(normalizeSeed(null)).toBeNull()
  })

  it('builds a share link that round-trips', () => {
    const url = new URL(seedLink(SEED, '0.4', 'https://sigildeck.com'))
    expect(normalizeSeed(url.searchParams.get('seed'))).toBe(SEED)
    expect(url.searchParams.get('v')).toBe('0.4')
  })

  it('gives each label its own stream', () => {
    const a = streamFor(SEED, 'deck:1')
    const b = streamFor(SEED, 'deck:1')
    const c = streamFor(SEED, 'deck:2')
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect([c(), c(), c()]).not.toEqual(xs)
  })
})

describe('a seeded run', () => {
  it('plays the same dungeon, offers and Forge for two players who choose alike', () => {
    const one = walk(SEED, 1, 5)
    const two = walk(SEED, 999, 5)
    expect(two.seen).toEqual(one.seen)
  })

  it('plays a different dungeon on a different seed', () => {
    const one = walk(SEED, 1, 3)
    const other = walk('ZZZZ0000', 1, 3)
    expect(other.seen.map(d => d.deck)).not.toEqual(one.seen.map(d => d.deck))
  })

  it('keeps the themes, Trials and monsters when the players choose differently', () => {
    const one = walk(SEED, 1, 5, () => ({ boon: 0, forge: true }))
    const two = walk(SEED, 2, 5, d => ({ boon: d, forge: false }))
    // The kit is the player's own and is shuffled into the deck, so the order
    // of cards is allowed to differ; what the dungeon puts in it is not.
    expect(two.seen.map(d => d.theme)).toEqual(one.seen.map(d => d.theme))
    expect(two.seen.map(d => d.themeChildren)).toEqual(one.seen.map(d => d.themeChildren))
    expect(two.seen.map(d => d.monsters)).toEqual(one.seen.map(d => d.monsters))
    // And the choices did diverge, or this test proves nothing.
    expect(two.state.boons).not.toEqual(one.state.boons)
  })

  it('is unchanged by a save and reload in the middle of a run', () => {
    // A save drops `rng` (it is a function) and the load substitutes
    // Math.random. Nothing a seeded run rolls may come from it.
    const straight = walk(SEED, 1, 4)
    let s = createRun(seededRng(1), { seed: SEED })
    const seen = []
    for (let d = 1; d <= 4; d++) {
      s = descend(s)
      const { rng: _rng, ...saved } = s
      s = { ...JSON.parse(JSON.stringify(saved)), rng: Math.random }
      seen.push([...s.room, ...s.deck].map(face))
      s = endDescentVictory(s)
      if (s.boonOffers.length > 0) s = pickBoon(s, s.boonOffers[0])
      while (forgeActive(s)) s = applyForgeEdit(s, s.forgeChoices[0].id)
    }
    expect(seen).toEqual(straight.seen.map(d => d.deck))
  })

  it('numbers choice-driven rolls within the descent', () => {
    const s = { seed: SEED, sigilsEarned: 2, playRolls: 0 }
    const first = playRoll(s)
    const second = playRoll(first.state)
    expect(first.state.playRolls).toBe(1)
    expect(second.value).not.toBe(first.value)
    // The same roll on a replay of the same moment lands the same way.
    expect(playRoll(s).value).toBe(first.value)
  })

  it('falls back to the run rng when there is no seed', () => {
    const rng = seededRng(7)
    const s = createRun(rng)
    expect(s.seed).toBeNull()
    expect(rngFor(s, 'deck:1')).toBe(rng)
    expect(playRoll(s).state).toBe(s)
  })
})

describe('setRunSeed', () => {
  const opening = () => createRun(seededRng(1), { seed: newSeed() })

  it('swaps the seed on the opening visit and marks it as chosen', () => {
    const s = setRunSeed(opening(), SEED)
    expect(s.seed).toBe(SEED)
    expect(s.seedChosen).toBe(true)
  })

  it('locks once the run has descended', () => {
    const s = descend(opening())
    expect(setRunSeed(s, SEED)).toBe(s)
    const back = endDescentVictory(s)
    expect(setRunSeed(back, SEED)).toBe(back)
  })

  it('cannot seed the tutorial', () => {
    const s = createRun(seededRng(1), { seed: newSeed(), tutorial: true })
    expect(setRunSeed(s, SEED)).toBe(s)
  })

  it('leaves the mode picker alone', () => {
    const s = setRunSeed(setRunMode(opening(), 'hardcore'), SEED)
    expect(s.mode).toBe('hardcore')
  })

  it('does not mark a minted seed as chosen', () => {
    expect(opening().seedChosen).toBe(false)
  })
})

describe('the run record', () => {
  it('carries the seed and whether the player chose it', () => {
    const s = { ...setRunSeed(createRun(seededRng(1), { seed: newSeed() }), SEED), phase: 'gameover' }
    const record = buildRunRecord(s, null)
    expect(record.seed).toBe(SEED)
    expect(record.seedChosen).toBe(true)
    // runSeed is the dedupe key and keeps its own, unrelated value.
    expect(record.runSeed).toBe(s.runSeed)
    expect(record.runSeed).not.toBe(SEED)
  })

  it('reads a legacy run as unseeded', () => {
    const s = { ...createRun(seededRng(1)), phase: 'gameover' }
    const record = buildRunRecord(s, null)
    expect(record.seed).toBeNull()
    expect(record.seedChosen).toBe(false)
  })
})
