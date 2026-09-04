// mergeProfiles: the function that decides what a player keeps (issue 33).
//
// Both cross-device sync and the guest->account fold reduce to this one call.
// It is the only code path in the app that can silently DESTROY progress: a
// merge that drops an unlock does not error, it just returns a smaller profile
// that /api/save writes back and the client copies over local storage. Nothing
// downstream would notice, so the coverage has to be here.
//
// Pure function, no database, no mocks.

import { describe, it, expect } from 'vitest'
import { mergeProfiles, runKey } from '../api/_lib/merge'

const run = (over = {}) => ({ accountId: 'acct', startedAt: 1000, runSeed: 'seed-a', ...over })

// A profile with every field populated, so a merge that drops one is visible.
const full = (over = {}) => ({
  library: ['numb'],
  ascensionUnlocked: 2,
  tutorialCompleted: true,
  seenSpecials: ['the_quiet'],
  history: [run()],
  save: { savedAt: 500, sigilsEarned: 3 },
  ...over,
})

describe('mergeProfiles', () => {
  it('unions unlocks rather than letting either side win', () => {
    const merged = mergeProfiles(
      full({ library: ['numb', 'stoic'], seenSpecials: ['the_quiet'] }),
      full({ library: ['stoic', 'cloak'], seenSpecials: ['the_long_night'] }),
    )
    expect(merged.library.sort()).toEqual(['cloak', 'numb', 'stoic'])
    expect(merged.seenSpecials.sort()).toEqual(['the_long_night', 'the_quiet'])
  })

  it('takes the higher ascension, so the ladder never walks backward', () => {
    expect(mergeProfiles(full({ ascensionUnlocked: 4 }), full({ ascensionUnlocked: 1 })).ascensionUnlocked).toBe(4)
    expect(mergeProfiles(full({ ascensionUnlocked: 1 }), full({ ascensionUnlocked: 4 })).ascensionUnlocked).toBe(4)
  })

  it('ORs the tutorial flag: once done, always done', () => {
    expect(mergeProfiles(full({ tutorialCompleted: true }), full({ tutorialCompleted: false })).tutorialCompleted).toBe(true)
    expect(mergeProfiles(full({ tutorialCompleted: false }), full({ tutorialCompleted: false })).tutorialCompleted).toBe(false)
  })

  it('keeps both devices’ runs and dedupes by run identity', () => {
    const mine = run({ startedAt: 1000, runSeed: 'a' })
    const theirs = run({ startedAt: 2000, runSeed: 'b' })
    const merged = mergeProfiles(full({ history: [mine] }), full({ history: [theirs] }))
    expect(merged.history).toHaveLength(2)
    expect(merged.history.map(runKey)).toEqual([runKey(mine), runKey(theirs)])
  })

  it('does not collapse two runs that share a start millisecond', () => {
    // The bug issue 09 fixed: without runSeed in the key these are one run.
    const a = run({ startedAt: 1000, runSeed: 'a' })
    const b = run({ startedAt: 1000, runSeed: 'b' })
    expect(mergeProfiles({ history: [a] }, { history: [b] }).history).toHaveLength(2)
  })

  it('drops records with neither an account nor a start', () => {
    const merged = mergeProfiles({ history: [null, {}, { note: 'junk' }, run()] }, {})
    expect(merged.history).toHaveLength(1)
  })

  it('caps history at 200 runs, discarding the oldest first', () => {
    const many = Array.from({ length: 250 }, (_, i) => run({ startedAt: i + 1, runSeed: `s${i}` }))
    const merged = mergeProfiles({ history: many.slice(0, 125) }, { history: many.slice(125) })
    expect(merged.history).toHaveLength(200)
    expect(merged.history[0].startedAt).toBe(51)
    expect(merged.history[199].startedAt).toBe(250)
  })

  it('gives the active run to the device that wrote most recently', () => {
    const older = { savedAt: 100, sigilsEarned: 1 }
    const newer = { savedAt: 200, sigilsEarned: 5 }
    expect(mergeProfiles(full({ save: older }), full({ save: newer })).save).toEqual(newer)
    expect(mergeProfiles(full({ save: newer }), full({ save: older })).save).toEqual(newer)
  })

  it('never lets a device with no run clobber one that has one', () => {
    const active = { savedAt: 100, sigilsEarned: 1 }
    expect(mergeProfiles(full({ save: active }), full({ save: null })).save).toEqual(active)
    expect(mergeProfiles(full({ save: null }), full({ save: active })).save).toEqual(active)
    expect(mergeProfiles(full({ save: null }), full({ save: null })).save).toBeNull()
  })

  it('converges: merging in either order gives the same profile', () => {
    const deviceA = full({
      library: ['numb', 'stoic'], ascensionUnlocked: 3, tutorialCompleted: true,
      seenSpecials: ['the_quiet'], history: [run({ startedAt: 1000, runSeed: 'a' })],
      save: { savedAt: 900, sigilsEarned: 2 },
    })
    const deviceB = full({
      library: ['cloak'], ascensionUnlocked: 1, tutorialCompleted: false,
      seenSpecials: ['the_long_night'], history: [run({ startedAt: 2000, runSeed: 'b' })],
      save: { savedAt: 100, sigilsEarned: 7 },
    })
    const ab = mergeProfiles(deviceA, deviceB)
    const ba = mergeProfiles(deviceB, deviceA)
    expect({ ...ab, library: ab.library.sort(), seenSpecials: ab.seenSpecials.sort() })
      .toEqual({ ...ba, library: ba.library.sort(), seenSpecials: ba.seenSpecials.sort() })
  })

  it('is idempotent: re-syncing an already merged profile changes nothing', () => {
    const once = mergeProfiles(full(), full({ library: ['cloak'], history: [run({ startedAt: 3000, runSeed: 'c' })] }))
    expect(mergeProfiles(once, once)).toEqual(once)
    expect(mergeProfiles(once, {})).toEqual(once)
  })

  it('returns a whole profile even when both sides are empty or absent', () => {
    expect(mergeProfiles(null, undefined)).toEqual({
      library: [], ascensionUnlocked: 0, tutorialCompleted: false,
      seenSpecials: [], history: [], save: null,
    })
  })

  it('treats a garbage ascension or a non-array unlock list as absent', () => {
    // A corrupted or hand-edited blob must not poison the merged profile.
    const merged = mergeProfiles(
      { library: 'numb', ascensionUnlocked: 'four', seenSpecials: null, history: 'nope' },
      full({ library: ['numb'], ascensionUnlocked: 2 }),
    )
    expect(merged.library).toEqual(['numb'])
    expect(merged.ascensionUnlocked).toBe(2)
    expect(merged.seenSpecials).toEqual(['the_quiet'])
    expect(merged.history).toHaveLength(1)
  })

  it('keeps the incoming copy when both sides hold the same run', () => {
    // Same key, different contents: the incoming record wins. That is what the
    // client wants (its own copy is the one it just finished writing), and it
    // stays convergent because the key already pins account, start and seed.
    const stored = run({ outcome: 'died' })
    const incoming = run({ outcome: 'escaped' })
    expect(mergeProfiles({ history: [stored] }, { history: [incoming] }).history)
      .toEqual([incoming])
  })
})
