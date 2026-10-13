// Run seeds (issue 38). A seed is a short code a player can read out or paste,
// and the same code plays the same dungeon for anyone who enters it.
//
// The seed is never consumed as one long random sequence. Combat draws from
// randomness in response to what the player does (Carrion's re-insert, the
// Brood's split, Gambler's Flail), so a single shared stream would shift every
// later roll the moment two players chose differently, and they would be in
// different dungeons by descent 2. Instead each roll that should match between
// players gets its own stream, derived from the seed and a label naming what
// and where it is: `deck:3` is descent 3's deck, `boons:2` the offer after
// sigil 2. A stream is rebuilt from its label every time it is needed, so
// there is no stream position to save, and a reload cannot shift anything.
//
// Choice-driven rolls go through playRoll(), which numbers them within the
// descent, so they are reproducible too without touching the shared streams.
//
// A run with no seed (an old save, or a test that passes its own rng) falls
// back to state.rng exactly as before.

// Crockford base32: no I, L, O or U, so a code read aloud or copied by hand
// cannot be misread. 8 characters is 32^8, about a trillion seeds.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SEED_LENGTH = 8

// Deterministic 32-bit PRNG (mulberry32). Same as test/support/state.js.
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// String to 32-bit hash (FNV-1a with a murmur3 finalizer), so labels that
// differ by one character still land on unrelated streams.
function hashString(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function streamFor(seed, label) {
  return makeRng(hashString(`${seed}|${label}`))
}

// A fresh random seed. Uses crypto where it exists; the seed is not a secret,
// so Math.random is an acceptable fallback.
export function newSeed() {
  const bytes = new Uint8Array(SEED_LENGTH)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (const b of bytes) out += ALPHABET[b & 31]
  return out
}

// Read whatever a player typed or pasted into a canonical seed, or null when
// it cannot be one. Case, spaces and dashes are ignored, and the characters
// Crockford leaves out are read as the ones they get mistaken for.
export function normalizeSeed(input) {
  if (typeof input !== 'string') return null
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (code.length !== SEED_LENGTH) return null
  for (const ch of code) if (!ALPHABET.includes(ch)) return null
  return code
}

// ABCD-EFGH: two halves are easier to read back than eight characters.
export function formatSeed(seed) {
  if (!seed) return ''
  return `${seed.slice(0, 4)}-${seed.slice(4)}`
}

// The rng for one labelled roll of a run. Seeded runs get the label's own
// stream; a run without a seed keeps its single state.rng.
export function rngFor(state, label) {
  if (state.seed) return streamFor(state.seed, label)
  return state.rng || Math.random
}

// One roll whose timing depends on the player's choices. Numbered within the
// descent so it is reproducible, and returned with the state that records it.
export function playRoll(state) {
  if (!state.seed) return { value: (state.rng || Math.random)(), state }
  const n = state.playRolls || 0
  const value = streamFor(state.seed, `play:${state.sigilsEarned || 0}:${n}`)()
  return { value, state: { ...state, playRolls: n + 1 } }
}

// The link a player shares. The version rides along so the receiving game can
// say when a balance change means the seed no longer plays the same dungeon.
//
// A challenge (issue 39) adds the time to beat and who set it: `t` in whole
// seconds, `by` the sharer's leaderboard name. Both are the sharer's own
// claim, shown only to whoever opens the link; the seed board is where times
// are checked against what the server actually recorded.
export function seedLink(seed, version, origin = globalThis.location?.origin || '', challenge = null) {
  const params = new URLSearchParams({ seed: formatSeed(seed) })
  if (version) params.set('v', version)
  if (challenge?.durationMs > 0) params.set('t', String(Math.round(challenge.durationMs / 1000)))
  if (challenge?.by) params.set('by', challenge.by)
  return `${origin}/?${params.toString()}`
}

// The challenge a run carries, if it is for the seed being played.
export function activeChallenge(game) {
  const c = game?.challenge
  return c && c.seed === game.seed ? c : null
}

export const MAX_CHALLENGER_NAME = 32
// Ten hours. Past that a time is not a challenge anyone is chasing, and a
// bigger number is a typo or a joke.
const MAX_CHALLENGE_SECONDS = 10 * 60 * 60

// Read a challenge off a link's params, or null when it does not carry a
// usable one. A name with no time is not a challenge; a time with no name is
// (the sharer may have played unlisted).
export function parseChallenge(params) {
  const t = Number.parseInt(params.get('t') ?? '', 10)
  if (!Number.isFinite(t) || t <= 0 || t > MAX_CHALLENGE_SECONDS) return null
  const by = String(params.get('by') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHALLENGER_NAME).trim()
  return { durationMs: t * 1000, by: by || null }
}
