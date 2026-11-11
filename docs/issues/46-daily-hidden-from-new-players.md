---
id: 46
title: "A brand-new player cannot see the Daily Descent until the tutorial is skipped"
priority: P2
area: product
effort: S
status: done
branch: issue-43-46-prod-findings
---

## Problem

Found in the production check on 2026-11-11 (issue 13). A first visit to
sigildeck.com opens the tutorial's sanctuary, which shows *Descend* and
*Skip tutorial* and nothing else. *Play today's Daily* appears only once the
tutorial is skipped or finished. So a post that says "try today's Daily" sends
new players to a page where it isn't offered.

This may be fine: the tutorial is the right first stop for someone who has
never played. It needs a decision, not just a fix.

## Options

1. **Leave it.** The Daily is for players who know the game.
2. **A link that starts the Daily: `sigildeck.com/?daily`.** It opens today's
   Daily directly, the way a `?seed=` link opens a seed, skipping the tutorial
   for that visit. Posts and the share text link to it. The default first visit
   stays the tutorial. *(Recommended: it reaches exactly the players who came
   for the Daily, changes nothing for anyone else, and is a few lines beside
   the existing seed-link handling.)*
3. **Offer it on the tutorial's opening screen**, as a quieter link beside
   *Skip tutorial*.
4. Both 2 and 3.

## Decided (Joey, 2026-11-11)

Option 2: the `/?daily` link. The first visit without it stays the
tutorial.

## Acceptance criteria

- [x] Joey picks an option (record it here with the date).
- [x] `/?daily` on a fresh profile opens today's Daily, past the tutorial for
      that run only, and takes `daily` out of the address bar.
- [x] A plain first visit still opens the tutorial.
- [x] It never replaces a run in progress (it says so instead), carries on
      with today's Daily if that is the run in progress, and wins over a
      seed in the same link.
- [x] The Daily's panels copy the link, not the seed.
- [x] Playwright from a fresh profile (no `tutorialCompleted` key); the
      tests fail without the launch code (checked: 5 of 7; the other two
      assert what the link must not change).
- [ ] Production: the issue 13 box for the link.

## Done (2026-11-11)

- **The link** is `dailyLink()` in `seed.js`: `<origin>/?daily`, with no date,
  so it means today's wherever it is opened. A link to one day's dungeon is
  an ordinary seed link.
- **Opening it** (`takeLaunchLink` / `openingGame` in `index.jsx`) follows
  the seed link's rules: read once, taken out of the address bar, never
  over a run with something to lose. The tutorial is skipped for that run
  only; `tutorialCompleted` is not set, so the player's next own run still
  starts with it.
- **Sharing**: *Copy Daily link* on the Daily's opening panel, and on its end
  screen while the day is still today. Before this, the only copy on a
  Daily was the seed line's, which hands a friend the bare seed: the same
  dungeon, but off the daily board. That one stays as it is, since it says
  "Seed" beside it.
- **Tests**: +1 unit (`seed.test.js`), +7 e2e (`visual/daily-link.spec.js`).
- GAME_VERSION unchanged.
