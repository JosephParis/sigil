import { describe, it, expect } from 'vitest'
import { createTracker, observe, abandonEvent } from '../src/games/scoundrel/analyticsEvents.js'
import { createRun, endDescentVictory } from '../src/games/scoundrel/logic/lifecycle.js'
import { pickBoon } from '../src/games/scoundrel/logic/sanctuary.js'
import { seededRng } from './support/state.js'

// Issue 34: the funnel must see the tutorial, where batch 1 starts, and the
// sanctuary choices that make a difficulty complaint actionable. Every event
// is asserted to fire exactly once however many times the effect re-runs.

const names = events => events.map(([e]) => e)

// Feed a sequence of game states through one tracker, observing each twice to
// stand in for React re-running the effect on an unchanged state.
function play(states, user = null) {
  const t = createTracker()
  const out = []
  for (const g of states) {
    out.push(...observe(t, g, user))
    out.push(...observe(t, g, user))
  }
  return { t, out }
}

const tutorialRun = () => ({ ...createRun(seededRng(1), { tutorial: true }), runStartedAt: 1000 })
const realRun = (runStartedAt = 2000) => ({ ...createRun(seededRng(2), { tutorial: false }), runStartedAt })
const inDescent = g => ({ ...g, phase: 'descent', theme: g.tutorial ? 'tutorial' : 'the_quiet' })

describe('the tutorial funnel', () => {
  it('a first session that opens the game and never descends is one run_started', () => {
    const { out } = play([tutorialRun()])
    expect(out).toEqual([['run_started', expect.objectContaining({ tutorial: true })]])
  })

  it('stopping mid-tutorial is distinguishable from never starting', () => {
    const g = tutorialRun()
    const { out } = play([g, inDescent(g)])
    expect(names(out)).toEqual(['run_started', 'tutorial_started', 'descent_started'])
    expect(out[2][1]).toMatchObject({ tutorial: true, descent_number: 1 })
  })

  it('a finished tutorial reports completion, then The Quiet as a descent of its own', () => {
    const g = tutorialRun()
    const walking = inDescent({ ...g, tutorialLessons: ['weapon', 'potion'] })
    const done = endDescentVictory(walking)
    expect(done.tutorial).toBe(false)
    expect(done.runStartedAt).toBe(1000)
    const quiet = inDescent(done)
    const { out } = play([g, walking, done, quiet])
    expect(names(out)).toEqual([
      'run_started', 'tutorial_started', 'descent_started',
      'descent_ended', 'tutorial_completed', 'descent_started',
    ])
    expect(out[3][1]).toMatchObject({ result: 'sanctuary', tutorial: true })
    expect(out[4][1]).toMatchObject({ lessons_done: 2 })
    // Both are descent 1 of the same run: The Quiet must not be swallowed as a
    // repeat of the tutorial descent.
    expect(out[5][1]).toMatchObject({ tutorial: false, descent_number: 1, theme: 'the_quiet' })
  })

  it('dying in the tutorial is tutorial_died, not a run_ended', () => {
    const g = inDescent(tutorialRun())
    const dead = { ...g, phase: 'gameover', hp: 0 }
    const { out } = play([tutorialRun(), g, dead])
    expect(names(out)).toContain('tutorial_died')
    expect(names(out)).not.toContain('run_ended')
    expect(names(out).filter(n => n === 'tutorial_died')).toHaveLength(1)
  })

  it('replacing an unfinished tutorial with a real run is a skip, with where it was left', () => {
    const g = inDescent({ ...tutorialRun(), tutorialLessons: ['weapon'] })
    const { out } = play([tutorialRun(), g, realRun()])
    const skip = out.find(([e]) => e === 'tutorial_skipped')
    expect(skip[1]).toMatchObject({ phase: 'descent', lessons_done: 1, replaced_by_tutorial: false })
    expect(names(out).filter(n => n === 'run_started')).toHaveLength(2)
  })

  it('beginning again after a tutorial death is not a skip', () => {
    const dead = { ...inDescent(tutorialRun()), phase: 'gameover', hp: 0 }
    const again = { ...tutorialRun(), runStartedAt: 3000 }
    const { out } = play([tutorialRun(), inDescent(tutorialRun()), dead, again])
    expect(names(out)).not.toContain('tutorial_skipped')
  })

  it('a completed tutorial is never also reported as skipped', () => {
    const walking = inDescent(tutorialRun())
    const done = endDescentVictory(walking)
    const { out } = play([tutorialRun(), walking, done, realRun()])
    expect(names(out)).toContain('tutorial_completed')
    expect(names(out)).not.toContain('tutorial_skipped')
  })
})

describe('resuming a save replays nothing', () => {
  it('a save loaded mid-descent reports no start and no past choices', () => {
    const g = { ...inDescent(realRun()), sigilsEarned: 3, boonPicks: [{ descent: 1, offered: ['a'], picked: 'a' }] }
    const { out } = play([g])
    expect(out).toEqual([])
  })

  it('a save that loads already over does not report its ending again', () => {
    const over = { ...realRun(), phase: 'gameover', sigilsEarned: 2 }
    const { out } = play([over])
    expect(out).toEqual([])
  })
})

describe('sanctuary choices', () => {
  it('each boon pick is reported once, with the offer it came from', () => {
    const g = { ...realRun(), boonOffers: ['iron_skin', 'second_wind'], boonChosen: false }
    const picked = pickBoon(g, 'second_wind')
    expect(picked.boonPicks).toHaveLength(1)
    const { out } = play([g, picked])
    const taken = out.filter(([e]) => e === 'boon_taken')
    expect(taken).toHaveLength(1)
    expect(taken[0][1]).toMatchObject({
      boon: 'second_wind',
      offered: ['iron_skin', 'second_wind'],
      offer_size: 2,
      descent_number: 1,
      sigils_earned: 0,
    })
  })

  it('each forge edit is reported once, applied or skipped', () => {
    const g = realRun()
    const edit = (type, chosen, skipped) => ({ descent: 4, type, offered: [{}, {}, {}], chosen, skipped })
    const one = { ...g, forgeEdits: [edit('upgrade', { suit: 'D', rank: 5 }, false)] }
    const two = { ...one, forgeEdits: [...one.forgeEdits, edit('remove', null, true)] }
    const { out } = play([g, one, two])
    const edits = out.filter(([e]) => e === 'forge_edit').map(([, p]) => p)
    expect(edits).toEqual([
      expect.objectContaining({ edit_type: 'upgrade', skipped: false, chosen_suit: 'D', chosen_rank: 5, offer_size: 3, sigils_earned: 3 }),
      expect.objectContaining({ edit_type: 'remove', skipped: true, chosen_suit: null, chosen_rank: null }),
    ])
  })

  it('a new run starts counting its choices from zero', () => {
    const first = { ...realRun(2000), boonPicks: [{ descent: 1, offered: ['a'], picked: 'a' }] }
    const second = { ...realRun(5000), boonPicks: [{ descent: 1, offered: ['b'], picked: 'b' }] }
    const { out } = play([realRun(2000), first, second])
    expect(out.filter(([e]) => e === 'boon_taken').map(([, p]) => p.boon)).toEqual(['a', 'b'])
  })
})

describe('descents and run endings', () => {
  it('a death reports the descent it ended and the run, once each', () => {
    const g = realRun()
    const d = { ...inDescent(g), roomsEntered: 4 }
    const dead = { ...d, phase: 'gameover', hp: 0 }
    const { out } = play([g, d, dead])
    expect(names(out)).toEqual(['run_started', 'descent_started', 'descent_ended', 'run_ended'])
    expect(out[2][1]).toMatchObject({ result: 'gameover', theme: 'the_quiet', rooms_this_descent: 4, tutorial: false })
  })
})

describe('abandonment', () => {
  it('fires during the tutorial, marked as such', () => {
    const t = createTracker()
    const ev = abandonEvent(t, { ...inDescent(tutorialRun()), tutorialLessons: ['weapon'] })
    expect(ev[0]).toBe('run_abandoned')
    expect(ev[1]).toMatchObject({ tutorial: true, lessons_done: 1 })
  })

  it('fires once per run, and never for a finished one', () => {
    const t = createTracker()
    const g = inDescent(realRun())
    expect(abandonEvent(t, g)).not.toBeNull()
    expect(abandonEvent(t, g)).toBeNull()
    expect(abandonEvent(t, { ...realRun(9000), phase: 'victory' })).toBeNull()
  })
})

describe('no PII in any event (issue 06)', () => {
  it('no property carries the name, email, account id or typed leaderboard name', () => {
    const user = { sub: 'google-sub-123456', email: 'player@example.com', name: 'Real Person' }
    const typed = 'Rookwarden The Bold'
    const withName = g => ({ ...g, playerName: typed, settings: { ...(g.settings || {}), playerName: typed } })

    const walking = withName(inDescent(tutorialRun()))
    const done = withName(endDescentVictory(walking))
    const sanctuary = withName({ ...done, boonOffers: ['iron_skin'], boonChosen: false })
    const picked = pickBoon(sanctuary, 'iron_skin')
    const forged = { ...picked, forgeEdits: [{ descent: 1, type: 'upgrade', offered: [], chosen: { suit: 'D', rank: 3 }, skipped: false }] }
    const quiet = inDescent(forged)
    const dead = { ...quiet, phase: 'gameover', hp: 0 }

    const t = createTracker()
    const all = []
    for (const g of [withName(tutorialRun()), walking, done, sanctuary, picked, forged, quiet]) all.push(...observe(t, g, user))
    all.push(abandonEvent(t, quiet))
    all.push(...observe(t, dead, user))

    // Every event this module can emit was exercised by the walk above.
    expect(new Set(names(all))).toEqual(new Set([
      'run_started', 'tutorial_started', 'descent_started', 'descent_ended',
      'tutorial_completed', 'boon_taken', 'forge_edit', 'run_abandoned', 'run_ended',
    ]))
    const blob = JSON.stringify(all.map(([, p]) => p))
    for (const secret of [user.sub, user.email, user.name, typed]) {
      expect(blob).not.toContain(secret)
    }
  })
})
