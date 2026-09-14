---
id: 34
title: "The analytics funnel cannot see the tutorial, which is where batch 1 starts"
priority: P2
area: product
effort: M
status: done
branch: dawn/2026-09-10
---

## Problem

`src/games/scoundrel/analytics.js` captures four events: `run_started`,
`descent_started`, `run_ended`, `run_abandoned`. Every one of them either skips
the tutorial or is skipped during it:

- `descent_started` — `&& !game.tutorial` (`analytics.js:200`)
- `run_ended` — `terminal && !game.tutorial` (`analytics.js:218`)
- `run_abandoned` — `if (!g || g.tutorial) return` (`analytics.js:116`)

So a first-time player who opens the game, starts the curated walk, and closes
the tab produces **exactly one event**: `run_started` with `tutorial: true`.
Nothing records whether they finished the tutorial, where they stopped, or
whether they ever reached a real descent.

There is no `tutorial_completed` event at all, even though the flag it would
report is already computed and persisted (`index.jsx:418`).

## Why it matters for batch 1

The tutorial is the first thing every invited player sees, and the single
question a first batch answers is **where people stop**. As instrumented, the
funnel starts after the part most likely to lose them.

Two things follow from that:

- A drop-off in the tutorial is indistinguishable from a player who never
  arrived. Both are one `run_started` and silence.
- `WINRATE_TARGETS.md` needs 1,500-2,000 default-mode A0 runs before the theme
  bands mean anything. If a chunk of batch 1 never reaches a real descent, the
  runs table fills slowly and nothing says why.

PostHog has been live and verified since 2026-08-27 (see issue 13), so this is
instrumentation that will actually be received.

## Suggested fix

Close the first-session funnel first — that is the whole value here:

- `tutorial_started` / `tutorial_completed` / `tutorial_skipped`
- `first_descent_started` — or simply stop excluding the tutorial from
  `descent_started` and let a `tutorial: true` property carry the distinction,
  which is how `run_started` already does it
- Let `run_abandoned` fire during the tutorial, with the same property

Then the choice telemetry that makes a difficulty complaint actionable:

- `boon_taken` (which, from which offer, at which sigil)
- `forge_edit` (add / upgrade / remove, at which sigil) — worth having before
  issue 29 changes how many Forge visits a run gets
- `descent_ended` with survived/died and the theme, so an abandoned run still
  reports the descents it did finish

**Constraint that overrides all of it:** no PII to PostHog. Issue 06 settled
that — the pseudonym system exists precisely so events carry no name, no email
and nothing derived from the Google profile. A new event must not be the thing
that quietly reintroduces one; the player-typed leaderboard name is not
eligible as a property.

Keep the existing dedupe discipline: every capture in this file is keyed so a
re-render or a resumed save cannot double-count, and new events need the same.

## Acceptance criteria

- [x] Tutorial start, completion and abandonment are all observable
- [x] A first session that stops mid-tutorial is distinguishable from one that
      never started
- [x] Boon and Forge choices are recorded with enough context to group them
- [x] No event carries a name, an email, or anything derived from the account
- [x] Each new event fires exactly once per occurrence (dedupe covered by tests)
- [x] `test/pseudonym.test.js`'s no-PII guarantee still holds, extended to the
      new properties

## Resolution (2026-09-10)

What gets sent now lives in `src/games/scoundrel/analyticsEvents.js`, a pure
tracker; `analytics.js` only wires it to React and PostHog. That split is what
made the dedupe testable: `test/analyticsEvents.test.js` (16 tests) drives it
with real `createRun` / `endDescentVictory` / `pickBoon` states and observes
every state twice, as a re-firing effect would. The no-PII sweep lives there
too, beside the events it checks, rather than in `test/pseudonym.test.js`.

New events: `tutorial_started`, `tutorial_completed`, `tutorial_died`,
`tutorial_skipped` (with the phase and lessons done when it was left),
`descent_ended` (any exit, with `result` sanctuary / victory / gameover),
`boon_taken` (the pick and the offer it came from) and `forge_edit` (grant type,
applied or skipped, the card's suit and rank). `descent_started` and
`run_abandoned` now fire during the tutorial and carry `tutorial: true`, as the
suggested fix proposed. A tutorial death is `tutorial_died`, never `run_ended`,
so the run-outcome numbers are unchanged.

**One consequence for anyone reading PostHog:** `descent_started` now counts the
tutorial descent too. An existing insight on it wants a `tutorial != true`
filter, or it will read slightly high from the day this ships.

**A trap the tests pin down:** the tutorial walk and The Quiet are both descent
1 of the same run (the tutorial shares its `runStartedAt`), so the old
`run:descent` dedupe key would have swallowed The Quiet's `descent_started` as
a repeat the moment the tutorial was counted. The key now names the tutorial.

**Not verified against PostHog.** Like the rest of the analytics, nothing is
received in `vite dev`; the first real events land after a deploy (issue 13).

On the 37 -> 34 edge: this closes the first-session funnel and the choice
telemetry, neither of which needs the simulator. The shared descent-survival
report the graph anticipates is still to be built, once 37 lands, from
`descent_ended` on one side and the simulator on the other.
