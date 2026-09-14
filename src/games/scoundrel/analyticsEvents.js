/**
 * The pure half of the run analytics: given the previous observation and the
 * current game state, which events happened. `useRunAnalytics` (analytics.js)
 * owns the React effects and the PostHog client; everything that decides what
 * to send lives here, so it can be unit-tested without a DOM (issue 34).
 *
 * A tracker is a plain mutable object that remembers what has already been
 * reported. Every event is keyed so a re-render, an effect re-fire or a resumed
 * save cannot count it twice.
 *
 * Events:
 *   run_started         a new run object begins (begin-again, replay, first load)
 *   tutorial_started    the player drops into the curated tutorial descent
 *   tutorial_completed  the tutorial descent was won and the run carries on
 *   tutorial_died       the player died inside the tutorial
 *   tutorial_skipped    a tutorial run was replaced by a real one before it ended
 *   descent_started     the player drops into a descent (tutorial: true for the walk)
 *   descent_ended       the player leaves a descent, by any exit
 *   boon_taken          a boon was picked from a sanctuary offer
 *   forge_edit          a Forge grant was applied or skipped
 *   run_ended           a real run reaches a terminal phase (victory/death/retire)
 *   run_abandoned       the tab was hidden mid-run (see abandonEvent)
 *
 * No PII, ever (issue 06). Properties are game state only: nothing here reads
 * the player's typed name, the account's email or display name, or the account
 * id. The one exception is run_ended, which goes through buildRunRecord and so
 * must strip what that record carries -- see runEndedProps.
 */

import { buildRunRecord } from './history'

// Flatten a stored run record into PostHog-friendly properties: scalar
// dimensions stay scalar (filterable), id-bearing lists collapse to id arrays.
// Picks fields explicitly rather than spreading, which is what keeps the
// record's playerName and accountId out of the event.
export function runEndedProps(r) {
  // Death detail (null on victory/retire). Flattened to scalars so each
  // dimension is filterable/groupable in PostHog: "where and how they died".
  const d = r.death || {}
  return {
    outcome: r.outcome,
    death_source: d.source || null,
    death_card_suit: d.card?.suit ?? null,
    death_card_rank: d.card?.rank ?? null,
    death_card_eff_rank: d.card?.effRank ?? null,
    death_boss: d.card?.boss ?? null,
    death_barehanded: d.barehanded ?? null,
    death_weapon_rank: d.weaponRank ?? null,
    death_damage: d.damage ?? null,
    death_hp_before: d.hpBefore ?? null,
    death_descent: d.descent ?? null,
    death_theme: d.theme ?? null,
    death_rooms_this_descent: d.roomsThisDescent ?? null,
    death_deck_remaining: d.deckRemaining ?? null,
    mode: r.mode?.id,
    mode_name: r.mode?.name,
    ascension: r.ascension || 0,
    ascension_name: r.ascensionName || null,
    sigils_earned: r.sigilsEarned,
    sigil_target: r.sigilTarget,
    duration_ms: r.durationMs,
    rooms_entered: r.roomsEntered,
    monsters_slain: r.monstersSlain,
    biggest_kill: r.biggestKill,
    boons: r.boons.map(b => b.id),
    boon_count: r.boons.length,
    themes_faced: r.themesFaced.map(t => t.id),
    bosses_defeated: r.bossesDefeated,
    boss_count: r.bossesDefeated.length,
    inscribed_count: (r.endingDeck || []).filter(c => c.inscribed).length,
    kit_size: (r.endingDeck || []).length,
    final_weapon_rank: r.finalWeapon?.rank ?? null,
  }
}

export function createTracker() {
  return {
    seeded: false,
    prev: null,             // the last game object observed
    lastRunStarted: null,
    lastDescentKey: null,
    reported: new Set(),    // one-shot event keys: `${event}:${runStart}...`
    boonPicksSeen: 0,       // entries of game.boonPicks already reported
    forgeEditsSeen: 0,      // entries of game.forgeEdits already reported
    abandonedRuns: new Set(),
  }
}

const lessonsDone = g => (g?.tutorialLessons || []).length
const descentNumberOf = g => (g.sigilsEarned || 0) + 1
// The tutorial walk and The Quiet are both descent 1 of the same run, so the
// key has to tell them apart or The Quiet's start is swallowed as a repeat.
const descentKeyOf = g => `${g.runStartedAt || null}:${g.tutorial ? 'tutorial' : descentNumberOf(g)}`
const isTerminal = g => g.phase === 'gameover' || g.phase === 'victory'

function once(t, key, events, event, props) {
  if (t.reported.has(key)) return
  t.reported.add(key)
  events.push([event, props])
}

// Decide what the transition from the tracker's last observation to `game`
// means. Returns [event, props] pairs in the order they happened; mutates `t`.
export function observe(t, game, user) {
  const events = []
  if (!game) return events
  const runStart = game.runStartedAt || null
  const prev = t.prev
  const base = { mode: game.mode, ascension: game.ascension || 0 }

  if (!t.seeded) {
    // First observation this session. Seed the edge state so resuming an
    // in-progress save doesn't replay its past transitions as new events.
    t.seeded = true
    t.lastRunStarted = runStart
    if (game.phase === 'descent') t.lastDescentKey = descentKeyOf(game)
    t.boonPicksSeen = (game.boonPicks || []).length
    t.forgeEditsSeen = (game.forgeEdits || []).length
    if (isTerminal(game)) {
      // A save that was already over when it loaded reported its ending then.
      t.reported.add(`end:${runStart}`)
      t.reported.add(`tutorial_end:${runStart}`)
    }
    // A brand-new opening run (sanctuary, nothing done yet) counts as a
    // start; a resumed mid-run save does not.
    const opening =
      game.phase === 'sanctuary' &&
      (game.sigilsEarned || 0) === 0 &&
      (game.runRoomsEntered || 0) === 0
    if (opening) events.push(['run_started', { ...base, tutorial: !!game.tutorial }])
    t.prev = game
    return events
  }

  // A new run object (begin again, replay, skip tutorial) carries a fresh
  // runStartedAt. The tutorial shares its run's runStartedAt with the real run
  // it hands off to, so this fires once per run, not once per descent.
  if (runStart && runStart !== t.lastRunStarted) {
    // Replacing a tutorial run that had neither been won nor lost is the skip
    // (the intro panel's button, or a discard from Settings). Recording where it
    // was left is the "where do they stop" signal.
    if (prev?.tutorial && !isTerminal(prev)) {
      once(t, `tutorial_end:${prev.runStartedAt || null}`, events, 'tutorial_skipped', {
        ...base,
        phase: prev.phase,
        lessons_done: lessonsDone(prev),
        replaced_by_tutorial: !!game.tutorial,
      })
    }
    t.lastRunStarted = runStart
    t.boonPicksSeen = 0
    t.forgeEditsSeen = 0
    events.push(['run_started', { ...base, tutorial: !!game.tutorial }])
  }

  // Left a descent, by any exit. Keyed by the descent that was left, which is
  // the one prev describes -- a won descent has already bumped sigilsEarned.
  if (prev?.phase === 'descent' && game.phase !== 'descent' && prev.runStartedAt === runStart) {
    once(t, `descent_end:${descentKeyOf(prev)}`, events, 'descent_ended', {
      ...base,
      result: game.phase, // sanctuary (survived), victory, or gameover
      theme: prev.theme || null,
      descent_number: descentNumberOf(prev),
      tutorial: !!prev.tutorial,
      hp: game.hp || 0,
      rooms_this_descent: prev.roomsEntered || 0,
      boon_count: (prev.boons || []).length,
    })
  }

  // The tutorial descent was won: the flag drops and the same run carries on
  // into The Quiet (endDescentVictory). Mirrors index.jsx's completion flag.
  if (prev?.tutorial && !game.tutorial && prev.runStartedAt === runStart && game.phase === 'sanctuary') {
    once(t, `tutorial_end:${runStart}`, events, 'tutorial_completed', {
      ...base,
      lessons_done: lessonsDone(prev),
    })
  }

  // Dropped into a descent. Keyed by run + ordinal so each leg fires once.
  if (game.phase === 'descent' && prev?.phase !== 'descent') {
    const key = descentKeyOf(game)
    if (t.lastDescentKey !== key) {
      t.lastDescentKey = key
      if (game.tutorial) {
        once(t, `tutorial_start:${runStart}`, events, 'tutorial_started', { ...base })
      }
      events.push(['descent_started', {
        ...base,
        theme: game.theme,
        descent_number: descentNumberOf(game),
        boon_count: (game.boons || []).length,
        tutorial: !!game.tutorial,
      }])
    }
  }

  // Sanctuary choices. Both are append-only logs on the run (sanctuary.js), so
  // reporting each entry past the ones already seen is exactly-once for free.
  const picks = game.boonPicks || []
  for (let i = t.boonPicksSeen; i < picks.length; i++) {
    const p = picks[i]
    events.push(['boon_taken', {
      ...base,
      boon: p.picked,
      offered: p.offered,
      offer_size: (p.offered || []).length,
      descent_number: p.descent,
      sigils_earned: (p.descent || 1) - 1,
    }])
  }
  t.boonPicksSeen = Math.max(t.boonPicksSeen, picks.length)

  const edits = game.forgeEdits || []
  for (let i = t.forgeEditsSeen; i < edits.length; i++) {
    const e = edits[i]
    events.push(['forge_edit', {
      ...base,
      edit_type: e.type,
      skipped: !!e.skipped,
      chosen_suit: e.chosen?.suit ?? null,
      chosen_rank: e.chosen?.rank ?? null,
      offer_size: (e.offered || []).length,
      descent_number: e.descent,
      sigils_earned: (e.descent || 1) - 1,
    }])
  }
  t.forgeEditsSeen = Math.max(t.forgeEditsSeen, edits.length)

  // Terminal phase. Dedupe by runStartedAt so an effect re-fire records the run
  // once. The tutorial walk is not a run record (history skips it too), so a
  // death there is its own event rather than a run_ended.
  if (isTerminal(game) && runStart) {
    if (game.tutorial) {
      once(t, `tutorial_end:${runStart}`, events, 'tutorial_died', {
        ...base,
        lessons_done: lessonsDone(game),
        rooms_this_descent: game.roomsEntered || 0,
      })
    } else if (!t.reported.has(`end:${runStart}`)) {
      t.reported.add(`end:${runStart}`)
      events.push(['run_ended', runEndedProps(buildRunRecord(game, user))])
    }
  }

  t.prev = game
  return events
}

// Mid-run abandon: the tab was hidden during a live run. Returns the event to
// send, or null. Fires once per run, and during the tutorial too (with
// tutorial: true), since a first session that closes mid-walk is precisely the
// drop-off batch 1 is meant to measure. PostHog-only by design: a tab-close run
// can be resumed later from the save, so it must not be written as a finished
// run record.
export function abandonEvent(t, g) {
  if (!g || isTerminal(g)) return null
  const runStart = g.runStartedAt
  if (!runStart || t.abandonedRuns.has(runStart)) return null
  t.abandonedRuns.add(runStart)
  return ['run_abandoned', {
    phase: g.phase,
    descent: descentNumberOf(g),
    sigils_earned: g.sigilsEarned || 0,
    hp: g.hp || 0,
    theme: g.theme || null,
    rooms_this_descent: g.roomsEntered || 0,
    boon_count: (g.boons || []).length,
    tutorial: !!g.tutorial,
    lessons_done: lessonsDone(g),
  }]
}
