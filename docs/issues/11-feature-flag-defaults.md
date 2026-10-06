---
id: 11
title: "Decide feature flag defaults for batch 1 (6 of 7 currently off)"
priority: P2
area: product
effort: S
status: done
branch: issue-11-flag-defaults
---

## Problem

`src/games/scoundrel/flags.js` ships these defaults:

```js
DEFAULTS = {
  modes: false,
  library: false,
  ascensions: false,
  wounds: false,
  customCards: true,
  bosses: false,
  specialMonsters: false,
}
```

So a first-batch player gets: default mode only, Ascension 0 only, no wounds, no
bosses, no special monsters, no card library. Six of seven systems are built,
tested, and unreachable.

These read as inherited development defaults rather than a launch decision — and
nobody has made the launch decision yet.

## Why it matters for batch 1

Two competing risks, and the answer isn't obvious:

- **Too little content**: batch 1 sees a thinner game than you've built, gives
  feedback on a subset, and may bounce before finding the depth. Bosses and
  special monsters in particular are the kind of thing that makes a roguelike
  feel like it has secrets.
- **Too much content**: unlocking everything at once means any balance signal
  mixes systems, and `WINRATE_TARGETS.md` targets ~20% winrate for
  **default-mode A0** specifically. Turn on modes and ascensions and your ~1,500
  run go point fragments across combinations you can't compare.

## Recommendation

Split the difference along the "does it fragment the dataset?" line:

- **Turn on** `bosses` and `specialMonsters` — they add texture *within*
  default-mode A0, so runs stay comparable and the game gets more interesting.
- **Turn on** `library` — that's issue 12, and it's a pure information win with
  no balance effect.
- **Leave off** `modes` and `ascensions` — these split the population across
  rulesets and directly undermine the winrate measurement in issue 13. They're
  also natural "batch 2" content, which gives returning players something new.
- **Decide** `wounds`: it changes the difficulty curve, so if it goes on it must
  go on *before* the measurement window starts, not during.

The critical constraint: **whatever you choose, don't change it mid-window.**
Flipping a gameplay flag partway through invalidates the runs on both sides of
the change unless you also bump `GAME_VERSION`.

## Correction: `library` is not the card library

The recommendation above says turning on `library` "is issue 12, and it's a pure
information win with no balance effect." Both halves are wrong. `library` is the
**Boon library** -- boons start locked and unlock through play
(`FLAG_META.library`, and `lifecycle.js:510` narrows the sanctuary offer pool to
`nextLibrary` when it is on). It changes what every run is offered, so it is a
balance flag. Issue 12's reference UI is not behind any flag: it is commented
out, and inside it only the boss, inscription and trait *sections* are gated, by
`bosses`, `customCards` and `specialMonsters`.

## Decision (Joey, 2026-10-05)

Batch 1 is the Reddit playtest push in `docs/reddit/POSTS.md` -- a qualitative
pass, not a balance measurement (recorded in issue 13). The defaults ship
**unchanged**:

| Flag | Batch 1 | Why |
|---|---|---|
| `modes` | off | Splits players across rulesets; batch-2 content |
| `ascensions` | off | Same; and every run stays A0, which is what `WINRATE_TARGETS.md` measures |
| `bosses` | off | Joey's call: ship the settled game, not the extra systems |
| `specialMonsters` | off | Same; it is also still labelled experimental |
| `wounds` | off | Same; it changes the difficulty curve |
| `library` | off | Same; every boon available from run 1 |
| `customCards` | **on** | Not revisited -- it has been on for every 0.4 run, so turning it off would itself be the rule change |

Because nothing changed, `GAME_VERSION` stays `0.4` and every run already on
the board is comparable with what batch 1 will play. Had a gameplay default
flipped, the call was to append `0.5`, since other players are already winning
on 0.4.

`test/flags.test.js` pins this set, so a default cannot change without the test
saying so, and asserts the `?flag-<id>` override both ways.

## Acceptance criteria

- [x] Explicit decision recorded for all 7 flags with reasoning
- [x] `DEFAULTS` updated to match -- they already did; now pinned by a test
- [x] Any flag affecting difficulty is settled before the issue 13 measurement window opens
- [x] If defaults change after runs are recorded, `GAME_VERSION` is bumped -- n/a, nothing changed
- [x] `?flag-<id>=1` override still works for your own testing (`test/flags.test.js`)
