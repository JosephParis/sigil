// Barrel re-export. The actual implementation lives in ./logic/*.
// External code (components, tests) imports from './logic' so the
// internal split is invisible to callers.

export {
  HEART, DIAMOND, CLUB, SPADE, WOUND, TOOL,
  SUIT_GLYPH, RANK_LABEL,
  BASE_MAX_HP, SIGIL_TARGET, ROOM_SIZE,
  MODES, DEFAULT_MODE, getMode,
  WOUND_DAMAGE_THRESHOLD, WOUND_CAP_PER_DESCENT, makeWoundCard,
  INSCRIBED_FRAMES, INSCRIBED_FRAME_IDS, makeInscribedCard, fixInscribedSuit,
  TRAITS, TRAIT_IDS,
  MAP_PEEK_COUNT,
  isMonster, isWeapon, isPotion, isTool, isCoin, isWound, isSkeletonKey, isMap, isWhetstone, isTorch, rankLabel, suitColor,
} from './constants'

export { THEMES, getTheme, getVisibleThemes } from './themes'
export { BOONS, getBoon, STARTER_BOON_IDS, UNLOCKABLE_BOON_IDS } from './boons'
export {
  AFFLICTIONS, AFFLICTION_IDS, BLEEDING_DAMAGE,
  hasAffliction, afflictionRoomsLeft, activeAfflictionIds,
} from './afflictions'
export {
  BOSSES, BOSS_IDS, getBoss, isBoss, devourerEffectiveRank,
} from './bosses'
export {
  ASCENSIONS,
  ASCENSION_MAX,
  getAscension,
  getAscensionEffects,
  getAscensionEffectsForState,
} from './ascensions'

export {
  FLAG_IDS,
  FLAG_META,
  getFlags,
  isEnabled,
  setFlag,
  resetAllFlags,
  getFlagDefault,
} from './flags'

export {
  TUTORIAL_LESSONS, tutorialAllLessonsDone, canFleeRoom,
  inflictAffliction, tickAfflictions, applyHeal,
} from './logic/helpers'

export {
  buildBaseDeck,
  shuffle,
} from './logic/deck'

export {
  playCard,
  playCardBare,
} from './logic/combat'

export {
  createRun,
  startNewRun,
  setRunMode,
  setRunAscension,
  setRunSeed,
  descend,
  retireRun,
  fleeRoom,
} from './logic/lifecycle'

export {
  pickBoon,
  applyForgeEdit,
  skipForgeEdit,
  forgeActive,
  rollForgeGrants,
  rollForgeChoices,
  initForgeBatch,
  dismissMapPeek,
  isWeaponUsableFor,
  previewMonsterDamage,
  getActiveThemesForState,
  describeMaxHp,
  describeWeaponStrength,
  describeDamage,
  describePotion,
  UPGRADE_BONUS,
  UPGRADE_RANK_CAP,
} from './logic/sanctuary'
