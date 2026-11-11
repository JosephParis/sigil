import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  assignedNameFor, deviceSeed, nameSuggestions, NAME_SPACE,
} from '../src/games/scoundrel/assignedName.js'
import { MAX_HANDLE_LENGTH, sanitizeHandle } from '../src/games/scoundrel/handle.js'
import { isHandleAllowed } from '../src/games/scoundrel/handleDenylist.js'
import { ADJECTIVES, NOUNS } from '../src/utils/pseudonym.js'

// The assigned name is the default identity every player carries onto the public
// board, so it has to satisfy three things at once that are easy to satisfy
// separately: it must fit a handle, survive the denylist, and be stable.
//
// The length one is the trap. The vocabulary is shared with pseudonym.js, which
// has no length budget -- "Candlelit Lamplighter 99" is 24 characters and joins
// with spaces -- so the filtering in assignedName.js is load-bearing and
// silently breaks if either word list grows past the budget.
//
// Since 2026-09-06 the name is one token, "AshenVagrant4718", and the whole
// 44 x 44 vocabulary fits. That is a property worth pinning rather than
// assuming: the moment a word is added that pushes a pair over the budget, the
// filter starts silently discarding pairs again, which is the state this
// change existed to get out of.

// Reasonably spread seeds, rather than 'a'/'b'/'c', so a hash that happened to
// bucket short similar strings together cannot pass this by luck.
const SEEDS = Array.from({ length: 400 }, (_, i) => `seed-${i}-${(i * 7919) % 104729}`)

describe('assignedNameFor — shape', () => {
  it('always fits a leaderboard handle', () => {
    for (const seed of SEEDS) {
      expect(assignedNameFor(seed).length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH)
    }
  })

  it('survives sanitizeHandle unchanged', () => {
    // A name the input field would rewrite is a name the player sees change
    // under them the first time they open Settings.
    for (const seed of SEEDS) {
      const name = assignedNameFor(seed)
      expect(sanitizeHandle(name)).toBe(name)
    }
  })

  it('is never a name the server would strip', () => {
    // The game handing out a name its own moderation refuses would put the
    // player on the board as Anonymous with no explanation.
    for (const seed of SEEDS) {
      expect(isHandleAllowed(assignedNameFor(seed))).toBe(true)
    }
  })

  it('never spells a slur with the number', () => {
    // The one that nearly shipped. isHandleAllowed folds leetspeak before it
    // matches, so the digits are letters to it: "Mason" + 1699 reads as
    // "masonigg" and "Sexton" + 4421 as "sextonazi". Filtering PAIRS against a
    // `pair + "0000"` probe cannot see either, because the offending letters are
    // in the number. 105 of the first 200,000 seeds produced one.
    //
    // Wide rather than deep on purpose: at roughly 1 in 1,900 a few hundred
    // seeds would pass this by luck.
    for (let i = 0; i < 60000; i++) {
      const name = assignedNameFor(`slur-probe-${i}-${(i * 7919) % 104729}`)
      expect(isHandleAllowed(name)).toBe(true)
    }
  // 60,000 names take about 3s alone; alongside the rest of the suite that
  // crosses vitest's 5s default. The width is the point, so the budget grows.
  }, 30000)

  it('re-rolls to somewhere unrelated rather than to the next number', () => {
    // Blocked names come in runs -- "Mason1699" and "Mason1699" differ from
    // "Mason1690" by one digit and fold to the same thing -- so a re-roll that
    // nudged the number would walk along a run of refusals.
    const seeds = Array.from({ length: 300 }, (_, i) => `reroll-${i}`)
    const names = seeds.map(assignedNameFor)
    expect(new Set(names).size).toBeGreaterThan(290)
  })

  it('reads as "AdjectiveNounNNNN", one token', () => {
    expect(assignedNameFor('anything')).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/)
  })

  it('carries no spaces or underscores', () => {
    // The join is what pays for the vocabulary fitting; a space creeping back in
    // would push the longest pairs over MAX_HANDLE_LENGTH and start silently
    // dropping them from PAIRS again.
    for (const seed of SEEDS) {
      expect(assignedNameFor(seed)).not.toMatch(/[\s_]/)
    }
  })

  it('always pads the number to four digits', () => {
    // A seed landing on 7 must read 0007, not 7, or two players' names are
    // different shapes and neither looks deliberate.
    const seen = new Set()
    for (const seed of SEEDS) seen.add(assignedNameFor(seed).slice(-4))
    for (const suffix of seen) expect(suffix).toMatch(/^\d{4}$/)
    // And the padding must be real padding, not a hash that never goes low.
    const lows = Array.from({ length: 20000 }, (_, i) => assignedNameFor(`pad-${i}`))
    expect(lows.some(n => n.endsWith('0') && /0\d{3}$/.test(n.slice(-4)))).toBe(true)
  })
})

describe('assignedNameFor — stability', () => {
  it('gives the same seed the same name every time', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      expect(assignedNameFor(seed)).toBe(assignedNameFor(seed))
    }
  })

  it('does not put similar seeds on similar names', () => {
    // Sequential ids are exactly what a device seed can look like, and a hash
    // used badly would walk them down the same adjective.
    const names = ['device-1', 'device-2', 'device-3', 'device-4'].map(assignedNameFor)
    // No space to split on any more, so compare everything but the number.
    expect(new Set(names.map(n => n.slice(0, -4))).size).toBeGreaterThan(1)
  })

  it('draws the pair and the number independently', () => {
    // These used to be two slices of one 32-bit hash -- `h % PAIRS.length` over
    // all of it and `(h >>> 16) % 100` over the top half -- which overlapped by
    // construction while a comment claimed they did not. If they are correlated,
    // fixing the pair collapses the numbers that appear beside it.
    const byPair = new Map()
    for (let i = 0; i < 40000; i++) {
      const name = assignedNameFor(`ind-${i}`)
      const pair = name.slice(0, -4)
      if (!byPair.has(pair)) byPair.set(pair, new Set())
      byPair.get(pair).add(name.slice(-4))
    }
    // The busiest pair should carry a spread of numbers, not a handful.
    const busiest = [...byPair.values()].reduce((a, b) => (b.size > a.size ? b : a))
    expect(busiest.size).toBeGreaterThan(10)
  })

  it('spreads across the space rather than clustering', () => {
    // Not a uniformity proof -- just enough to catch a generator that collapsed
    // onto a handful of names, which would undo the whole point of giving
    // guests distinguishable identities.
    const names = new Set(SEEDS.map(assignedNameFor))
    expect(names.size).toBeGreaterThan(SEEDS.length * 0.9)
  })

  it('has a name space large enough for the board to stay distinguishable', () => {
    // Over five million was the goal of the 2026-09-06 change. At the old 67,900
    // some two of 300 players shared a name 48% of the time.
    expect(NAME_SPACE).toBeGreaterThan(5_000_000)
  })

  it('uses the whole vocabulary, discarding no pair for length', () => {
    // The point of concatenating and of the 24-character cap. At 16 with spaces,
    // 345 of 1,024 pairs were unreachable by any player and nothing said so.
    expect(NAME_SPACE).toBe(ADJECTIVES.length * NOUNS.length * 10_000)
  })
})

describe('nameSuggestions', () => {
  it('returns the number asked for', () => {
    expect(nameSuggestions(3)).toHaveLength(3)
    expect(nameSuggestions(1)).toHaveLength(1)
  })

  it('returns distinct names', () => {
    for (let i = 0; i < 50; i++) {
      const names = nameSuggestions(3)
      expect(new Set(names).size).toBe(3)
    }
  })

  it('never offers the name the player already has', () => {
    // Offering someone their own name as a change is the one option guaranteed
    // to be useless.
    const mine = assignedNameFor('device-a')
    for (let i = 0; i < 100; i++) {
      expect(nameSuggestions(3, mine)).not.toContain(mine)
    }
  })

  it('produces names that fit and pass the denylist', () => {
    for (let i = 0; i < 100; i++) {
      for (const name of nameSuggestions(3)) {
        expect(name.length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH)
        expect(isHandleAllowed(name)).toBe(true)
      }
    }
  })

  it('terminates even when asked for more names than it can make', () => {
    // The loop is bounded rather than "retry until full"; without that this
    // hangs the render it is called from.
    expect(nameSuggestions(20).length).toBeGreaterThan(0)
  })
})

describe('deviceSeed', () => {
  let store

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mints once and reuses it', () => {
    const first = deviceSeed()
    expect(first).toBeTruthy()
    expect(deviceSeed()).toBe(first)
  })

  it('persists under its own key, not one the game already uses', () => {
    deviceSeed()
    expect(store.has('scoundrel:deviceId')).toBe(true)
  })

  it('gives two devices different seeds', () => {
    const a = deviceSeed()
    store.clear()
    expect(deviceSeed()).not.toBe(a)
  })

  it('still returns a seed when storage throws', () => {
    // Private browsing. A name that is merely unstable beats a crash on the way
    // to the leaderboard.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => {},
    })
    expect(deviceSeed()).toBeTruthy()
    expect(assignedNameFor(deviceSeed()).length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH)
  })
})
