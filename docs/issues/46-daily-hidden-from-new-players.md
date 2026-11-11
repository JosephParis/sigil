---
id: 46
title: "A brand-new player cannot see the Daily Descent until the tutorial is skipped"
priority: P2
area: product
effort: S
status: open
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

## Acceptance criteria

- [ ] Joey picks an option (record it here with the date).
- [ ] Whatever is built has a Playwright test from a fresh profile (no
      `tutorialCompleted` key).
