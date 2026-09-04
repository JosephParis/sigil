---
id: 29
title: "BUG the Forge stops opening at sigil 7 while the run needs 10"
priority: P1
area: bug
effort: S
status: done
---

## Problem

`SIGIL_TARGET` is 10, so a run is nine returns to the sanctuary and a tenth
descent that ends it. The Forge is supposed to open on every one of those
returns at Ascension 0 — the rules say so twice — but it silently stops after
the seventh.

```js
// src/games/scoundrel/ascensions.js:70
forgeSigils: [1, 2, 3, 4, 5, 6, 7],
```

```js
// src/games/scoundrel/logic/lifecycle.js:513
const forgeOpen = !mode.noForge && forgeSigilSet.has(newSigils)
```

`newSigils` is 8 and then 9 on the last two returns, neither is in the set, and
the sanctuary simply does not offer the Forge. No log line, no explanation — the
station a player has used seven times in a row is just gone for the two visits
that matter most.

## Evidence

- `src/games/scoundrel/constants.js:23` — `SIGIL_TARGET = 10`
- `src/games/scoundrel/ascensions.js:70` — the A0 default, `[1..7]`
- `src/games/scoundrel/ascensions.js:62` — the comment above it says "the
  default covers all of them, so the Forge opens after every descent". That was
  true when the target was 7. It is now false.
- `src/games/scoundrel/logic/lifecycle.js:496` — a second stale comment,
  "forgeSigils swaps the 2/4/6 cadence for the level's set". A0 has not been a
  2/4/6 cadence for a long time.
- `src/games/scoundrel/components/rules.jsx:165` — "Each time you return you
  pick one Boon and Forge your kit"
- `src/games/scoundrel/components/rules.jsx:285` — "Forge — After each descent:
  Add, Upgrade, or Remove a kit card."

The rest of the codebase did move to 10. `src/games/scoundrel/themes.js:441`
reads "Tier 5 covers 8-10", and `pickThemeId` bands correctly through the last
three descents. This one constant was left behind.

## Why it matters for batch 1

- It is a **rules violation the player can see**. The in-game rules promise a
  Forge visit and the game withholds it, twice, in the endgame.
- Descents 8, 9 and 10 are the Tier 5 band — the hardest Trials in the game.
  Losing kit edits exactly there is a real difficulty spike that was never
  designed, and it lands on the run a player is most invested in.
- It quietly distorts the balance data. `WINRATE_TARGETS.md` sets a ~20% total
  winrate and the wall is expected late; part of that wall is an accident.

## Suggested fix

Derive the default from `SIGIL_TARGET` rather than restating it:

```js
// every return, however long the run is
forgeSigils: Array.from({ length: SIGIL_TARGET - 1 }, (_, i) => i + 1),
```

`ascensions.js` does not import from `constants.js` today — check for a cycle
before adding the import; `constants.js` is a leaf, so this should be clean.

Leave **Cold Coals** (`ascensions.js:39`, level 4, `forgeSigils: [3, 5]`) exactly
as it is. That restriction is the whole point of the ascension and its
description names the sigils explicitly.

Fix both stale comments while you are in there.

## GAME_VERSION

**This shares `0.4`. Do not open `0.5`.** It is a balance-affecting change, but
nothing has shipped to users on `0.4` yet, so there is no population of `0.4`
runs this would make incomparable. Recorded here so an unattended run does not
have to make the call — see the `GAME_VERSION` rule in the backlog README.

## Acceptance criteria

- [x] The Forge opens on returns at 8 and 9 sigils at A0
- [x] The A0 default is derived from `SIGIL_TARGET`, not a hand-written list
- [x] Cold Coals still restricts the Forge to sigils 3 and 5
- [x] A vitest case covers a return at 8 and 9 sigils (`test/lifecycle.test.js`,
      state factories in `test/support/state.js`)
- [x] `test/designDocs.test.js` fails if the Forge cadence and `SIGIL_TARGET`
      ever disagree again
- [x] Both stale comments corrected (`ascensions.js:62`, `lifecycle.js:496`)
- [x] No `VERSION_HISTORY` entry added; the decision above is recorded in this file

## Resolution

Fixed on `dawn/2026-09-02`. The A0 default is now
`Array.from({ length: SIGIL_TARGET - 1 }, (_, i) => i + 1)`, so the Forge opens
on every return however long the run is; `ascensions.js` imports `SIGIL_TARGET`
from `constants.js` (a leaf, no cycle). Cold Coals keeps its literal `[3, 5]`.
Both stale comments corrected. `test/lifecycle.test.js` walks a return at every
sigil from 1 to `SIGIL_TARGET - 1` and asserts the Forge opens with a batch to
spend; `test/designDocs.test.js` holds REWORK.md's every-visit cadence to the A0
set, so the two cannot silently disagree again. No `VERSION_HISTORY` entry:
this shares `0.4` as recorded above.
