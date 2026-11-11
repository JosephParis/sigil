// Run seeds (issue 38): the same seed plays the same dungeon for anyone who
// enters it, and a player's choices cannot shift the parts that should match.
//
// Each walk below gives the run a *different* fallback rng from the seed it is
// playing, so a test passes only if the seed, not the rng, decided the roll.

import { describe, it, expect, afterEach } from 'vitest'
import {
  createRun, setRunSeed, setRunMode, descend, endDescentVictory, fleeRoom,
} from '../src/games/scoundrel/logic/lifecycle'
import { playCard } from '../src/games/scoundrel/logic/combat'
import { pickBoon, applyForgeEdit, skipForgeEdit, forgeActive } from '../src/games/scoundrel/logic/sanctuary'
import { isMonster, SIGIL_TARGET } from '../src/games/scoundrel/constants'
import { ASCENSION_MAX } from '../src/games/scoundrel/ascensions'
import { setFlag, resetAllFlags } from '../src/games/scoundrel/flags'
import { installLocalStorage, uninstallLocalStorage } from './support/localStorage'
import { buildRunRecord } from '../src/games/scoundrel/history'
import {
  newSeed, normalizeSeed, formatSeed, streamFor, rngFor, playRoll, seedLink, SEED_LENGTH,
  parseChallenge, activeChallenge, MAX_CHALLENGER_NAME,
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
function walk(seed, rngSeed, descents, choose = () => ({ boon: 0, forge: true }), options = {}) {
  let s = createRun(seededRng(rngSeed), { seed, ...options })
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
    if (s.boonOffers?.length > 0) {
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

// What a seed promises (issue 40, Joey's rule of 2026-10-14). Two players on
// one seed, under the same rules (GAME_VERSION, mode, ascension, flags), get:
//   1. the same Trials, whatever they do;
//   2. the same run, step for step, if they do the same things.
// Nothing else is promised: once choices differ, the deck order, offers and
// rolls may all differ. DESIGN.md §7 states the same rule.
describe("the seed's promise (issue 40)", () => {
  const trials = run => run.seen.map(d => ({ theme: d.theme, children: d.themeChildren }))

  // Two players who part ways at the very first sanctuary and never agree
  // again: different Boons, and one forges while the other skips.
  function divergingPair(seed, options = {}) {
    const one = walk(seed, 1, SIGIL_TARGET, () => ({ boon: 0, forge: true }), options)
    const two = walk(seed, 2, SIGIL_TARGET, d => ({ boon: d, forge: false }), options)
    return { one, two }
  }

  it('meets the same Trial at every descent of a full run, whatever the player does', () => {
    const { one, two } = divergingPair(SEED)
    expect(one.seen).toHaveLength(SIGIL_TARGET)
    expect(trials(two)).toEqual(trials(one))
    // The choices really did part from the first sanctuary...
    expect(two.seen[0].offers).toEqual(one.seen[0].offers)
    expect(two.state.boons).not.toEqual(one.state.boons)
    expect(two.state.kit).not.toEqual(one.state.kit)
    // ...and the run reached The Long Night, so its children were compared.
    expect(one.seen.some(d => d.themeChildren?.length === 2)).toBe(true)
  })

  describe('under each rule set', () => {
    afterEach(() => {
      resetAllFlags()
      uninstallLocalStorage()
    })

    function rules(flags) {
      installLocalStorage()
      for (const [id, on] of Object.entries(flags)) setFlag(id, on)
    }

    for (const special of [false, true]) {
      for (let level = 0; level <= ASCENSION_MAX; level++) {
        it(`holds at ascension ${level}${special ? ' with special monsters' : ''}`, () => {
          rules({ ascensions: true, specialMonsters: special })
          const { one, two } = divergingPair(SEED, { ascension: level })
          expect(one.state.ascension).toBe(level)
          expect(trials(two)).toEqual(trials(one))
          expect(two.state.boons).not.toEqual(one.state.boons)
        })
      }
    }

    it('is a promise per rule set: the rules themselves may change the Trials', () => {
      // Not part of the promise, but it shows the loop above is comparing
      // genuinely different rule sets, not the same one fifteen times.
      rules({ ascensions: true })
      const base = trials(walk(SEED, 1, SIGIL_TARGET))
      const offset = trials(walk(SEED, 1, SIGIL_TARGET, undefined, { ascension: ASCENSION_MAX }))
      expect(offset).not.toEqual(base)
    })
  })

  // Every room played card by card. The walk takes the first card it can in
  // each room and flees when it can take none, the same way in both runs.
  // Both players are held at the same high HP after each descent starts, so
  // the walk reaches the deep Trials (Carrion on this seed) instead of dying
  // in the first room. HP feeds no roll.
  const HELD_HP = 999

  // State as the player sees it. Card ids carry a counter and a timestamp
  // (and forgeInscribedIds is a list of them), and the run's clock and
  // fallback rng are not part of the dungeon.
  const NOT_THE_DUNGEON = new Set(['id', 'forgeInscribedIds', 'rng', 'runStartedAt', 'runSeed', 'pausedAt', 'pausedMs'])
  const seenState = s => JSON.parse(JSON.stringify(s, (k, v) => (NOT_THE_DUNGEON.has(k) ? undefined : v)))

  function playThrough(seed, rngSeed) {
    let s = createRun(seededRng(rngSeed), { seed })
    const steps = []
    let rolls = 0
    while (s.phase !== 'gameover' && s.phase !== 'victory') {
      if (steps.length > 5000) throw new Error('the walk never finished')
      if (s.phase === 'sanctuary') {
        if (s.boonOffers?.length > 0 && !s.boonChosen) s = pickBoon(s, s.boonOffers[0])
        while (forgeActive(s)) s = applyForgeEdit(s, s.forgeChoices[0].id)
        s = { ...descend(s), hp: HELD_HP }
      } else {
        let next = s
        for (let i = 0; i < s.room.length && next === s; i++) {
          if (s.room[i]) next = playCard(s, i)
        }
        if (next === s) next = fleeRoom(s)
        if (next === s) throw new Error('the walk is stuck: no card can be played and the room cannot be fled')
        if (next.sigilsEarned === s.sigilsEarned && (next.playRolls || 0) > (s.playRolls || 0)) rolls++
        s = next
      }
      steps.push(seenState(s))
    }
    return { steps, rolls, state: s }
  }

  it('plays the same run, card for card, for two players who do the same things', () => {
    const one = playThrough(SEED, 1)
    const two = playThrough(SEED, 999)
    expect(one.state.phase).toBe('victory')
    // Choice-driven rolls (Carrion here) were taken, or the combat streams
    // were never compared.
    expect(one.rolls).toBeGreaterThan(0)
    expect(two.steps).toHaveLength(one.steps.length)
    for (let i = 0; i < one.steps.length; i++) {
      expect(two.steps[i], `step ${i}`).toEqual(one.steps[i])
    }
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

describe('challenges (issue 39)', () => {
  const params = q => new URLSearchParams(q)

  it('round-trips a time to beat and who set it through the link', () => {
    const url = new URL(seedLink(SEED, '0.4', 'https://sigildeck.com', { durationMs: 872400, by: 'Cassandra' }))
    expect(url.searchParams.get('t')).toBe('872')
    expect(parseChallenge(url.searchParams)).toEqual({ durationMs: 872000, by: 'Cassandra' })
  })

  it('leaves the challenge off a plain seed link', () => {
    const url = new URL(seedLink(SEED, '0.4', 'https://sigildeck.com'))
    expect(url.searchParams.has('t')).toBe(false)
    expect(parseChallenge(url.searchParams)).toBeNull()
  })

  it('takes a time without a name, but not a name without a time', () => {
    expect(parseChallenge(params('t=600'))).toEqual({ durationMs: 600000, by: null })
    expect(parseChallenge(params('by=Cassandra'))).toBeNull()
  })

  it('refuses a time nobody could be chasing', () => {
    expect(parseChallenge(params('t=0'))).toBeNull()
    expect(parseChallenge(params('t=-5'))).toBeNull()
    expect(parseChallenge(params('t=abc'))).toBeNull()
    expect(parseChallenge(params(`t=${11 * 3600}`))).toBeNull()
  })

  it('clamps and tidies the name it shows', () => {
    const c = parseChallenge(params(`t=60&by=${encodeURIComponent('  a   b  ' + 'x'.repeat(100))}`))
    expect(c.by.startsWith('a b ')).toBe(true)
    expect(c.by.length).toBeLessThanOrEqual(MAX_CHALLENGER_NAME)
  })

  it('ties the challenge to the seed it came with', () => {
    const s = createRun(seededRng(1), { seed: SEED, seedChosen: true, challenge: { durationMs: 600000, by: 'C' } })
    expect(activeChallenge(s)).toEqual({ durationMs: 600000, by: 'C', seed: SEED })
    // Typing a different seed in drops it: the time was set on another dungeon.
    const other = setRunSeed(s, 'ZZZZ0000')
    expect(other.challenge).toBeNull()
    expect(activeChallenge(other)).toBeNull()
  })

  it('carries no challenge without a seed to pin it to', () => {
    expect(createRun(seededRng(1), { challenge: { durationMs: 1, by: 'C' } }).challenge).toBeNull()
  })
})
