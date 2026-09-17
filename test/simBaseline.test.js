// Issue 37: the balance numbers, held to a stored baseline.
//
// `test/sim.test.js` holds the simulator's mechanics. This file holds what it
// measures, which is the thing `WINRATE_TARGETS.md` is about.
//
// It asserts against `sim/baseline.json` rather than against the spec's own
// 15-25% band, and that is deliberate. The measured winrate is 0%, so a test
// written straight against the band would be red from the moment it was
// committed and would be skipped within a week. A stored baseline instead
// makes any movement visible - a balance change, or a better policy - which is
// what makes the number a test rather than an intention. The gap to the spec is
// recorded in `docs/issues/37-no-balance-simulator.md`, not hidden here.
//
// Regenerate deliberately, never to make this file pass:
//   npm run sim -- --runs 200 --seed 1 --policy greedy --write-baseline

import { describe, it, expect } from 'vitest'
import { simulateBatch } from '../sim/run'
import { greedyPolicy } from '../sim/policies'
import { buildReport, TOTAL_BAND, TIERS, tierOf, verdictFor, survivedLeg } from '../sim/report'
import baseline from '../sim/baseline.json'

// The same seed range the baseline was generated over. Both numbers are part
// of the baseline's identity: change either and the curve is not comparable.
const RUNS = baseline.meta.runs
const SEED = baseline.meta.seed

describe('the stored baseline', () => {
  const report = buildReport(
    simulateBatch({ runs: RUNS, seed: SEED, policy: greedyPolicy }),
    { policy: 'greedy', seed: SEED }
  )

  it('reproduces exactly: same seeds, same policy, same curve', () => {
    // Seeds are the batch's identity, so this is an equality test and not a
    // tolerance. A diff here means the rules changed, which is either a
    // balance change that wants a new baseline or a regression that does not.
    expect(report.total).toEqual(baseline.total)
    expect(report.descents).toEqual(baseline.descents)
    expect(report.forge).toEqual(baseline.forge)
  })

  it('runs fast enough to stay in the unit suite', () => {
    const startedAt = Date.now()
    simulateBatch({ runs: RUNS, seed: SEED, policy: greedyPolicy })
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })
})

describe('the spec the baseline is measured against', () => {
  it('states the total band from WINRATE_TARGETS.md', () => {
    expect(TOTAL_BAND).toEqual({ low: 15, high: 25, target: 20 })
  })

  it('covers all ten descents with exactly one tier each', () => {
    for (let descent = 1; descent <= 10; descent++) {
      const tiers = TIERS.filter(t => t.descents.includes(descent))
      expect(tiers).toHaveLength(1)
      expect(tierOf(descent)).toBe(tiers[0])
    }
  })

  it('reads a survival against its band the way the decision rule does', () => {
    const band = { low: 82, high: 85 }
    expect(verdictFor(84, band)).toBe('in')
    // The 3-point tolerance exists so nobody chases noise.
    expect(verdictFor(80, band)).toBe('tolerance')
    expect(verdictFor(87, band)).toBe('tolerance')
    expect(verdictFor(70, band)).toBe('below')
    expect(verdictFor(92, band)).toBe('above')
    expect(verdictFor(null, band)).toBe('no-data')
  })

  it('counts a leg as survived only when it actually ended alive', () => {
    // An unfinished leg carries `outcome: null` (`lifecycle.js:297`). Reading
    // survival as "not died" would count it, and every number above would be
    // silently inflated.
    expect(survivedLeg({ outcome: 'cleared' })).toBe(true)
    expect(survivedLeg({ outcome: 'retired' })).toBe(true)
    expect(survivedLeg({ outcome: 'died' })).toBe(false)
    expect(survivedLeg({ outcome: null })).toBe(false)
  })
})

describe('Forge visits, so issue 29 cannot come back silently', () => {
  it('opens on every return between descents at Ascension 0', () => {
    // Issue 29 was the Forge quietly stopping at sigil 7 in a run that needs
    // 10. A run that reaches descent N has returned to the sanctuary N-1
    // times, and at Ascension 0 the Forge is open on each of them, so visits
    // must track descents reached rather than stalling below it.
    const records = simulateBatch({ runs: RUNS, seed: SEED, policy: greedyPolicy })
    for (const record of records) {
      const cleared = record.descents.filter(survivedLeg).length
      expect(record.forgeVisits).toBe(cleared)
    }
  })
})
