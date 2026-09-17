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
// Flee when clearing the room would cost this fraction of current HP.
//
// The first version tested the CHEAPEST monster against 0.9 of HP, which is a
// test that almost never fires and fires too late when it does: over 120 seeds
// flight was legal in 1016 rooms and the policy took it 13 times. A room is a
// commitment to three of its four cards, so the decision has to be priced on
// the room rather than on its easiest card.
const FLEE_AT = 0.55

// A room forces three of its four cards (`ROOM_SIZE` less the one left
// behind), so its cost is the net HP swing of the cheapest three: monsters
// cost, potions refund, weapons and tools are free. An estimate is enough - it
// only has to be better than looking at one card.
const CARDS_FORCED_PER_ROOM = 3

function roomCost(state, room) {
  const swings = room.map(({ card }) => {
    if (isMonster(card)) return monsterCost(state, card)
    if (isPotion(card)) return -(card.rank ?? 0)
    return 0
  })
  return swings
    .sort((a, b) => a - b)
    .slice(0, CARDS_FORCED_PER_ROOM)
    .reduce((total, swing) => total + (Number.isFinite(swing) ? swing : 0), 0)
}

// What a held weapon is still worth, in HP it can absorb.
//
// The binding rule (`combat.js:86-88`) is that a blade which has slain
// something may only answer monsters of that rank or lower, and a fresh blade
// answers anything. So a weapon's usefulness is its rank capped by what it is
// still allowed to hit: a rank 10 blunted down to 2 is worth 2, and a fresh 3
// is worth 3. That single number is why a fresh low weapon can be a real
// upgrade over a spent high one.
function weaponWorth(weapon) {
  if (!weapon) return 0
  const cap = weapon.lastSlain ? weapon.lastSlain.rank : Number.POSITIVE_INFINITY
  return Math.min(weapon.rank ?? 0, cap)
}


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

  // Weapons: take the best one in the room, and only when it beats what is
  // already in hand. The first version of this policy took every weapon in
  // room order, which threw a good blade away for a worse one on the next
  // card and is most of why it never cleared a descent.
  const weapons = room
    .filter(e => isWeapon(e.card))
    .map(e => ({ ...e, worth: e.card.rank ?? 0 }))
    .sort((a, b) => b.worth - a.worth)
  const held = weaponWorth(state.weapon)
  if (weapons.length > 0 && weapons[0].worth > held) {
    const { index } = weapons[0]
    ordered.push({ apply: s => playCard(s, index) })
  }

  // Utilities (tools, coins) are free and only ever help.
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

  const tooExpensive = roomCost(state, room) >= state.hp * FLEE_AT
  if (tooExpensive && canFleeRoom(state)) {
    // Ahead of everything, including a weapon we would like: flight takes the
    // whole room, and playing any card at all forfeits it. Deciding to leave
    // and then picking up one more card is how the old rule managed to test
    // for flight and never take it.
    ordered.unshift({ apply: s => fleeRoom(s) })
    // Drinking is the fallback when the room is warded and flight is refused.
    for (const { index } of potions) ordered.push({ apply: s => playCard(s, index) })
  }

  // Swing at the BIGGEST monster the blade can answer, not the cheapest.
  //
  // The binding cap only ever falls (`combat.js:299`), so every kill spends
  // some of the weapon's remaining reach and descending order is the order
  // that wastes none of it. Descent 1's deck is the proof: 16 monsters
  // summing to rank 88, against a rank 6 weapon and 30 HP. Taken in
  // descending order a single 6 absorbs all of it for about 12 damage
  // (9,9,8,8,7,7 cost 3,3,2,2,1,1 and everything at or below 6 is free);
  // taken cheapest-first the same blade is blunted to a 2 in three swings and
  // every large monster after that has to be fought bare-handed.
  //
  // Cheapest-first is why the first version of this policy could not clear the
  // friendliest theme in the game.
  const affordable = monsters.filter(m => m.cost < state.hp)
  const biggestArmed = affordable
    .filter(m => isWeaponUsableFor(state, m.card))
    .sort((a, b) => (b.card.rank ?? 0) - (a.card.rank ?? 0))[0]
  if (biggestArmed) ordered.push({ apply: s => playCard(s, biggestArmed.index) })

  for (const { card, index } of monsters) {
    // playCard swings the best bound weapon when there is one; playCardBare is
    // the fallback for a monster no weapon will answer.
    if (isWeaponUsableFor(state, card)) ordered.push({ apply: s => playCard(s, index) })
    ordered.push({ apply: s => playCardBare(s, index) })
  }

  // Anything left: potions not yet drunk, a weapon we judged no upgrade (it is
  // still better than being stuck), then a random legal action so that an
  // unforeseen room shape ends the run rather than stalling it.
  for (const { index } of potions) ordered.push({ apply: s => playCard(s, index) })
  for (const { index } of weapons) ordered.push({ apply: s => playCard(s, index) })

  const next = applyFirstAccepted(state, ordered)
  if (next !== state) return next
  return randomPolicy(state, rng)
}

export const POLICIES = { random: randomPolicy, greedy: greedyPolicy }
