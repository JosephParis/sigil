// The two policies (issue 37).
//
// Neither is a good player and neither needs to be. They are two fixed points,
// so that a balance change can be read as a delta rather than an opinion.
//
// Both apply exactly one legal action per call and must return a state that is
// not the one they were given — `simulateRun` treats an unchanged state as a
// stall, because the logic returns the same object for an illegal action and a
// policy that keeps issuing one would otherwise hang rather than fail.

import {
  pickBoon, applyForgeEdit, skipForgeEdit, forgeActive, descend,
  playCard, playCardBare, fleeRoom,
  canFleeRoom, isMonster, isPotion, isWeapon,
  isWeaponUsableFor, previewMonsterDamage,
} from '../src/games/scoundrel/logic'

// Every action legal in the current phase, as thunks. Legality here is
// "the logic might accept it" — the caller confirms by checking that the state
// actually changed, which keeps this list from having to re-implement the
// rules it is driving.
export function legalActions(state) {
  if (state.phase === 'sanctuary') {
    const actions = []
    if (!state.boonChosen) {
      for (const boonId of state.boonOffers || []) {
        actions.push({ kind: 'boon', boonId, apply: s => pickBoon(s, boonId) })
      }
      // A sanctuary with an unchosen boon and no offers would deadlock on
      // `descend`; falling through to it is correct, the guard catches the rest.
      if (actions.length > 0) return actions
    }
    if (forgeActive(state)) {
      for (const card of state.forgeChoices || []) {
        actions.push({ kind: 'forge', card, apply: s => applyForgeEdit(s, card.id) })
      }
      actions.push({ kind: 'forgeSkip', apply: s => skipForgeEdit(s) })
      return actions
    }
    return [{ kind: 'descend', apply: s => descend(s) }]
  }

  if (state.phase === 'descent') {
    const actions = []
    ;(state.room || []).forEach((card, index) => {
      if (!card) return
      actions.push({ kind: 'play', index, card, apply: s => playCard(s, index) })
      if (isMonster(card)) {
        actions.push({ kind: 'bare', index, card, apply: s => playCardBare(s, index) })
      }
    })
    if (canFleeRoom(state)) {
      actions.push({ kind: 'flee', apply: s => fleeRoom(s) })
    }
    return actions
  }

  return []
}

// Apply the first candidate the logic actually accepts. Returns the unchanged
// state only when every candidate was refused, which `simulateRun` reports.
function applyFirstAccepted(state, candidates) {
  for (const action of candidates) {
    const next = action.apply(state)
    if (next !== state) return next
  }
  return state
}

// -- Random -------------------------------------------------------------

// Uniform over the legal actions. The floor: it exists so the greedy number
// means something.
export function randomPolicy(state, rng = Math.random) {
  const actions = legalActions(state)
  if (actions.length === 0) return state
  const shuffled = actions.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return applyFirstAccepted(state, shuffled)
}

// -- Greedy -------------------------------------------------------------

// Below this fraction of max HP, drink before fighting.
const DRINK_BELOW = 0.7
// Flee when the cheapest monster in the room would take this fraction of
// current HP, and fleeing is still allowed.
const FLEE_AT = 0.9

// What this monster costs right now, using the game's own preview rather than
// a second implementation of the damage rules. `null` means unknown (face
// down), which the policy treats as expensive.
function monsterCost(state, card) {
  const preview = previewMonsterDamage(state, card)
  if (preview.faceDown) return Number.POSITIVE_INFINITY
  const weapon = isWeaponUsableFor(state, card) ? preview.weapon?.value : null
  const bare = preview.bare?.value
  const costs = [weapon, bare].filter(v => typeof v === 'number')
  if (costs.length === 0) return Number.POSITIVE_INFINITY
  return Math.min(...costs)
}

// One ply, no search: take the free things, heal when hurt, kill the cheapest
// monster available, and run when the cheapest thing in the room would kill.
export function greedyPolicy(state, rng = Math.random) {
  if (state.phase === 'sanctuary') {
    // Boons and forge edits are taken by a stated preference rather than an
    // evaluation — the first offer, and the first card offered. Evaluating them
    // would make the policy a design opinion, which is what the report is for.
    const actions = legalActions(state)
    if (actions.length === 0) return state
    const preferred = actions.find(a => a.kind !== 'forgeSkip') || actions[0]
    return applyFirstAccepted(state, [preferred, ...actions])
  }

  if (state.phase !== 'descent') return state

  const room = (state.room || []).map((card, index) => ({ card, index })).filter(e => e.card)
  const ordered = []

  // Weapons and utilities first: they are free and only ever help.
  for (const { card, index } of room) {
    if (isWeapon(card)) ordered.push({ apply: s => playCard(s, index) })
  }
  for (const { card, index } of room) {
    if (!isWeapon(card) && !isPotion(card) && !isMonster(card)) {
      ordered.push({ apply: s => playCard(s, index) })
    }
  }

  const hurt = state.maxHp > 0 && state.hp < state.maxHp * DRINK_BELOW
  const potions = room.filter(e => isPotion(e.card))
  const monsters = room
    .filter(e => isMonster(e.card))
    .map(e => ({ ...e, cost: monsterCost(state, e.card) }))
    .sort((a, b) => a.cost - b.cost)

  if (hurt) {
    for (const { index } of potions) ordered.push({ apply: s => playCard(s, index) })
  }

  const cheapest = monsters[0]
  const lethal = cheapest && cheapest.cost >= state.hp * FLEE_AT
  if (lethal && canFleeRoom(state)) {
    ordered.push({ apply: s => fleeRoom(s) })
    // Drinking is the fallback when the room is warded and flight is refused.
    for (const { index } of potions) ordered.push({ apply: s => playCard(s, index) })
  }

  for (const { card, index } of monsters) {
    // playCard swings the best bound weapon when there is one; playCardBare is
    // the fallback for a monster no weapon will answer.
    if (isWeaponUsableFor(state, card)) ordered.push({ apply: s => playCard(s, index) })
    ordered.push({ apply: s => playCardBare(s, index) })
  }

  // Anything left: potions not yet drunk, then a random legal action so that an
  // unforeseen room shape ends the run rather than stalling it.
  for (const { index } of potions) ordered.push({ apply: s => playCard(s, index) })

  const next = applyFirstAccepted(state, ordered)
  if (next !== state) return next
  return randomPolicy(state, rng)
}

export const POLICIES = { random: randomPolicy, greedy: greedyPolicy }
