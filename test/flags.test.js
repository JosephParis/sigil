// Feature-flag launch defaults (issue 11).
//
// The defaults are a launch decision, not leftover dev state: every run on
// GAME_VERSION 0.4 was played under exactly this set, so flipping one silently
// mixes two rulesets under one version. Changing a gameplay default means
// changing this test AND appending to VERSION_HISTORY -- see the decision
// recorded in docs/issues/11-feature-flag-defaults.md.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { FLAG_IDS, getFlagDefault, getFlags, isEnabled, resetAllFlags } from '../src/games/scoundrel/flags'

function stubBrowser(search = '') {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  })
  vi.stubGlobal('window', { location: { search } })
  // Drops the module's cached view so the stubs above are what it reads.
  resetAllFlags()
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetAllFlags()
})

describe('launch defaults', () => {
  it('ships every gameplay system off except custom cards', () => {
    const defaults = Object.fromEntries(FLAG_IDS.map(id => [id, getFlagDefault(id)]))
    expect(defaults).toEqual({
      modes: false,
      library: false,
      ascensions: false,
      wounds: false,
      customCards: true,
      bosses: false,
      specialMonsters: false,
    })
  })

  it('is what a fresh device with no overrides actually gets', () => {
    stubBrowser()
    expect(isEnabled('bosses')).toBe(false)
    expect(isEnabled('specialMonsters')).toBe(false)
    expect(isEnabled('customCards')).toBe(true)
  })
})

describe('?flag-<id> override', () => {
  it('turns an off-by-default system on for testing', () => {
    stubBrowser('?flag-bosses=1&flag-wounds')
    expect(isEnabled('bosses')).toBe(true)
    expect(isEnabled('wounds')).toBe(true)
    expect(isEnabled('modes')).toBe(false)
  })

  it('turns an on-by-default system off', () => {
    stubBrowser('?flag-customCards=0')
    expect(isEnabled('customCards')).toBe(false)
  })

  it('ignores unknown flag ids', () => {
    stubBrowser('?flag-godMode=1')
    expect(getFlags()).not.toHaveProperty('godMode')
  })
})
