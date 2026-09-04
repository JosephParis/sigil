// Ascensions: stacking difficulty knobs unlocked by clearing the previous
// level. Level 0 is the base game. Each named level layers ONE additional
// nerf on top of every level below it; getAscensionEffects collapses them
// into a single effects object the rest of the codebase reads.
//
// To add a new ascension, append a new entry to ASCENSIONS. Each entry
// describes only its own delta; cumulative effects are computed by folding
// all entries up to the requested level. Effects must be small and orthogonal
// so they remain debuggable when stacked.

import { isEnabled as isFlagEnabled } from './flags'
import { SIGIL_TARGET } from './constants'

export const ASCENSIONS = [
  // Index 0 is the base game; null placeholder so array indices line up
  // with level numbers (ASCENSIONS[1] is Ascension 1, etc).
  null,
  {
    level: 1,
    name: 'Restless Sanctuary',
    description: 'The sanctuary only heals you to 90% of max HP between descents.',
    sanctuaryHealMultiplier: 0.9,
  },
  {
    level: 2,
    name: 'Lean Offers',
    description: 'Boon offers are 2 instead of 3.',
    boonOfferCount: 2,
  },
  {
    level: 3,
    name: 'Quickening Halls',
    description: 'Theme tiers arrive one sigil earlier, so harder themes show up sooner.',
    themeTierOffset: 1,
  },
  {
    level: 4,
    name: 'Cold Coals',
    description: 'The Forge opens only at sigils 3 and 5, not after every descent.',
    forgeSigils: [3, 5],
  },
  {
    level: 5,
    name: 'Hollow Bones',
    description: 'Max HP −2.',
    maxHpBonus: -2,
  },
  {
    level: 6,
    name: 'Sharpened Names',
    description: 'Face-card monsters (J, Q, K, A) hit at +1 effective rank.',
    faceCardRankBonus: 1,
  },
]

export const ASCENSION_MAX = ASCENSIONS.length - 1

export function getAscension(level) {
  return ASCENSIONS[level] || null
}

// Default (level 0) effects — equivalent to the base game with no ascension.
// forgeSigils lists every sigil at which the Forge opens. The default is
// derived from SIGIL_TARGET so it covers every return to the sanctuary however
// long the run is: sigils 1..SIGIL_TARGET-1, the final descent ending the run
// rather than returning. Hand-writing the list is what broke when the target
// went 7 -> 10 (issue 29). Harder ascensions (Cold Coals) restrict this to
// fewer visits.
const DEFAULTS = Object.freeze({
  level: 0,
  sanctuaryHealMultiplier: 1,
  boonOfferCount: 3,
  themeTierOffset: 0,
  forgeSigils: Array.from({ length: SIGIL_TARGET - 1 }, (_, i) => i + 1),
  maxHpBonus: 0,
  faceCardRankBonus: 0,
})

// Collapse every ascension from 1..level into one effects object. Numeric
// fields stack (maxHpBonus, faceCardRankBonus); singletons (forgeSigils,
// boonOfferCount) take the latest level's value.
export function getAscensionEffects(level) {
  const clamped = Math.max(0, Math.min(level || 0, ASCENSION_MAX))
  if (clamped === 0) return { ...DEFAULTS, level: 0 }
  const effects = { ...DEFAULTS, level: clamped }
  for (let i = 1; i <= clamped; i++) {
    const a = ASCENSIONS[i]
    if (!a) continue
    if (a.sanctuaryHealMultiplier !== undefined) effects.sanctuaryHealMultiplier = a.sanctuaryHealMultiplier
    if (a.boonOfferCount !== undefined) effects.boonOfferCount = a.boonOfferCount
    if (a.themeTierOffset !== undefined) effects.themeTierOffset = a.themeTierOffset
    if (a.forgeSigils !== undefined) effects.forgeSigils = a.forgeSigils
    if (a.maxHpBonus !== undefined) effects.maxHpBonus += a.maxHpBonus
    if (a.faceCardRankBonus !== undefined) effects.faceCardRankBonus += a.faceCardRankBonus
  }
  return effects
}

// Convenience: read the cumulative effects given a game state. Used by the
// places (combat, computeMaxHp) that already pass state around. Returns
// level-0 (base) effects when the 'ascensions' flag is off, so existing
// state.ascension values become inert without needing to be cleared.
export function getAscensionEffectsForState(state) {
  if (!isFlagEnabled('ascensions')) return getAscensionEffects(0)
  return getAscensionEffects(state?.ascension || 0)
}
