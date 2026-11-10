---
id: 41
title: "A seed from an old run can only be replayed by typing it back in"
priority: P2
area: product
effort: S
status: done
branch: issue-41-play-seed-from-history
---

## Problem

Run history shows each run's seed and a copy link (issue 38), but replaying
one of your own runs means copying the code, closing history, opening "Play a
friend's seed" and pasting it back. The end screen has *Play this seed again*
(issue 39); history, where a player looks back at a run they want another go
at, has nothing.

The seed is also out of sight once the first descent starts. It is in the
pause menu, but a player streaming or screenshotting a run has no seed on
screen to point at.

## Decided (Joey, 2026-10-22)

This is Phase 1 of the seed plan in issue 40, cut down to what Joey approved:

- **"Play this seed" from run history: yes.**
- **The seed shown during a descent: worth trying, not a requirement.** If it
  costs the phone layout room, leave it out.
- The rest of Phase 1 (entered seeds earn no unlocks, challenge links carry
  mode and ascension) was not approved. Do not build it here.

## Fix

- An expanded history row gets **Play this seed** when the record has a seed.
  It starts a fresh run on that seed, as an entered seed (`seedChosen`, so it
  stays off the main board), and closes history.
- It follows the same rule as a shared link (`openingGame` in `index.jsx`): it
  replaces the current run only when that run has nothing to lose (none,
  finished, or still on its opening visit). Otherwise the row says to finish or
  retire the run first, and nothing changes.
- A record from another `GAME_VERSION` still plays, with the same notice a link
  from another version gets: the dungeon will not match.
- The descent's sidebar (desktop only, `md:` and up, where there is room) shows
  the seed under the mode badge. Phones keep their layout.

## Acceptance criteria

- [x] Play this seed in history starts that seed on the opening visit, marked
      entered, and closes history.
- [x] With a run in progress past the opening visit, it refuses, says why, and
      the run is untouched.
- [x] A record from another version plays with the version notice.
- [x] The seed shows in the desktop descent sidebar and not on a phone.
- [x] Playwright covers all four; `npm run lint && npm run build && npm run test` green.

## Done (2026-11-09)

- History and a shared link now share one rule, `runHasNothingToLose` in
  `index.jsx`, and one version notice, `versionNotice`. The refusal shows under
  the button and history stays open.
- The sidebar seed is its own panel (`DescentSeed` in `components/seed.jsx`)
  with no copy link: the pause menu already has one, and a second
  `data-testid="run-seed"` would collide with it.
- A record with no seed (from before issue 38) offers no button.
- `visual/play-seed-from-history.spec.js`: 6 tests, the four criteria plus the
  seedless record, and the phone case asserts its viewport is below `md:`.
- Gate: lint and build clean; 757 unit pass; 228 e2e pass, 1 known skip, and
  `device-lab` timed out once in the loaded full run. It times out the same way
  with this change stashed (2 of 8 alone), so it is the old flake, not this.
- **GAME_VERSION: unchanged.** No balance is touched; `0.4` stays.
