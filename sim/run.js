// Headless run driver (issue 37).
//
// Nothing here ships. `sim/` is a sibling of `test/` and `visual/` precisely
// so that the payload work in issues 16 and 32 stays easy to reason about:
// no file under `src/` may import this directory.
//
// The game logic was written to be driven this way and nobody had noticed.
// Every `logic/` function is pure, the rng is injected rather than imported,
// and every terminal transition fires inside the logic — so a driver only ever
// reads `state.phase` and applies one action.

import { createRun, DEFAULT_MODE } from '../src/games/scoundrel/logic'

// A run that has not ended by here is a bug, not a long run. The real cap is
// far lower: ten descents of a fifty-card deck, plus sanctuary actions.
export const MAX_STEPS = 5000

// Deterministic 32-bit PRNG (mulberry32), the same one `test/support/state.js`
// uses. Duplicated rather than imported because `sim/` must not depend on the
// test harness — it is driven from a CLI that vitest never loads.
export function seededRng(seed = 1) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The reference population `WINRATE_TARGETS.md:46-48` fixes the numbers
// against: engaged default-mode, Ascension 0 players. Simulating anything else
// produces a number that cannot be compared to the targets.
export const REFERENCE_POPULATION = Object.freeze({
  mode: DEFAULT_MODE,
  ascension: 0,
  tutorial: false,
})

// One seeded run, played to `gameover` or `victory`, reduced to a record.
//
// The policy gets its own rng so that a change of policy cannot shift the
// game's own shuffle sequence — two policies on seed 7 face the same decks.
export function simulateRun(seed, policy, options = {}) {
  const gameRng = seededRng(seed)
  const policyRng = seededRng(seed ^ 0x9e3779b9)

  let state = createRun(gameRng, { ...REFERENCE_POPULATION, ...options })

  let steps = 0
  let forgeVisits = 0
  let forgeCountedThisVisit = false

  while (state.phase !== 'gameover' && state.phase !== 'victory') {
    if (steps++ > MAX_STEPS) {
      throw new Error(
        `run ${seed} did not terminate after ${MAX_STEPS} steps ` +
        `(phase=${state.phase}, sigils=${state.sigilsEarned}, boonChosen=${state.boonChosen})`
      )
    }

    if (state.phase === 'sanctuary') {
      if (state.forgeOpen && !forgeCountedThisVisit) {
        forgeVisits += 1
        forgeCountedThisVisit = true
      }
    } else {
      forgeCountedThisVisit = false
    }

    const next = policy(state, policyRng)
    if (next === state) {
      throw new Error(
        `run ${seed} stalled: the policy returned an unchanged state ` +
        `(phase=${state.phase}, sigils=${state.sigilsEarned})`
      )
    }
    state = next
  }

  return recordOf(state, seed, steps, forgeVisits)
}

// The run reduced to the fields the report aggregates. Deliberately small and
// JSON-serialisable: a batch of ten thousand of these is held in memory.
export function recordOf(state, seed, steps, forgeVisits) {
  const descents = (state.descents || []).map(d => ({
    descent: d.descent,
    themes: d.themes || [],
    outcome: d.outcome,
    endHp: d.endHp,
  }))

  return {
    seed,
    won: state.phase === 'victory',
    sigilsEarned: state.sigilsEarned || 0,
    // The descent the run died on, or 11 for a win (all ten cleared).
    reached: descents.length,
    retired: !!state.retired,
    deathSource: state.phase === 'gameover' ? (state.deathContext?.source || 'unknown') : null,
    deathDescent: state.phase === 'gameover' ? (state.deathContext?.descent ?? null) : null,
    forgeVisits,
    steps,
    descents,
  }
}

// A batch of consecutive seeds. Seeds are the batch's identity: the same range
// and the same policy give the same curve in any process, which is what makes
// `sim/baseline.json` meaningful.
export function simulateBatch({ runs = 1000, seed = 1, policy, options = {} }) {
  const records = []
  for (let i = 0; i < runs; i++) {
    records.push(simulateRun(seed + i, policy, options))
  }
  return records
}
