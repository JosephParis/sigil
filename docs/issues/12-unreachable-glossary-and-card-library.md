---
id: 12
title: "Card library and the Boons/Trials glossary are built but unreachable"
priority: P2
area: product
effort: S
status: open
---

## Problem

Three finished pieces of reference UI are commented out of every entry point:

- `src/games/scoundrel/components/rules.jsx:66` — `RULES_TABS` has the **Boons**,
  **Trials**, and **Card library** tabs commented out.
- `src/games/scoundrel/components/TopBar.jsx:268` — Card library menu entry
  commented out, marked `TEMPORARY:`.
- `src/games/scoundrel/components/HomeView.jsx:19` — same, commented out.
- `visual/screens.spec.js` — `test.skip('card-library')`, so the screenshot test
  is parked too.

The components themselves are complete; `onOpenCardLibrary` is still threaded
through `TopBar`'s props all the way down.

## Why it matters for batch 1

This is the largest new-player gap in the build. A first-time player who draws a
Trial with monster traits has **no way to look up what those traits do** — there
are 7 `TRAITS` and 13 `INSCRIBED_FRAMES` in `constants.js`, all of which change
how a fight resolves. Same for boons: they're offered by name with no reference
for what a name means once the offer screen is gone.

Roguelikes lean hard on players building a mental model across runs. Removing the
reference material means batch 1 learns slower, dies to things they couldn't have
anticipated, and reports it as "unfair" rather than "I misplayed" — which is
feedback you can't act on.

The `TEMPORARY:` marker suggests these were parked for a reason (mid-rework
staleness is the likely one). Whatever the reason, it needs re-checking against
the shipped kit model before launch.

## Suggested fix

1. Find out why they were parked — check `git log` for the commenting-out commit.
   If the content was stale relative to the Kit Rework, that's a content fix, not
   a reason to keep them hidden.
2. Audit the content of each against the current game: `BOONS`, the 7 `TRAITS`,
   the 13 `INSCRIBED_FRAMES`, and the kit/dungeon split from `REWORK.md`.
   Anything describing the pre-rework 44-card deck editing or `Strike` is wrong
   (see issue 23).
3. Uncomment the three tabs and both menu entries. Note the `library` feature
   flag defaults to `false` — issue 11 covers turning it on.
4. Un-skip the `card-library` visual test and regenerate its snapshot.

## Acceptance criteria

- [ ] Boons, Trials, and Card library tabs reachable from the rules modal
- [ ] Card library reachable from both `HomeView` and `TopBar`
- [ ] All content verified against the post-rework game; no `Strike` or whole-deck-editing references
- [ ] `card-library` visual test un-skipped and passing
- [ ] A new player can look up any trait or inscribed frame they encounter

## Unblocked by issue 11 (2026-10-05)

Step 3 above is wrong about the flag: `library` is the Boon *unlock* system, not
this UI, and nothing gates these tabs but the comments. Issue 11 kept every
gameplay flag off except `customCards`, which narrows the job:

- `CardLibraryContent` hides its boss and trait sections while `bosses` and
  `specialMonsters` are off (`cardLibrary.jsx:53-55`). Batch 1 cannot meet a
  boss or a trait, so the criterion "look up any trait" holds trivially for
  them. The inscriptions section shows, because `customCards` is on, so audit
  that one.
- The **Trials** tab will not list Trials that never roll: reference UI goes
  through `getVisibleThemes()` (`themes.js:479`), which drops the experimental
  pool while `specialMonsters` is off. Confirm the tab really calls it when it
  comes back.

## Inherited from issue 25 (2026-08-22)

Issue 25's copy audit closed, and handed this one the part that depends on the
tabs coming back:

- `ThemesGlossary`'s theme-preview claim is **already fixed** — it no longer
  says "You see it before you descend, so spend your Boon as counterplay",
  because re-enabling the tab with that line would have put a promise the game
  does not keep back in front of players.
- **Still to audit before unhiding:** `BoonsGlossary` ("Pick 1 of 3 each
  sanctuary visit... draw biases toward tags you've taken less") and
  `CardLibraryContent`, neither of which was checked against the post-rework
  game.
- `visual/copy-accuracy.spec.js` asserts on the rules modal. When the tabs
  return, extend it there rather than starting a new spec.
