---
id: 44
title: "The leaderboard says unnamed runs are listed as Anonymous; they go up under the assigned name"
priority: P3
area: copy
effort: S
status: done
branch: issue-43-46-prod-findings
---

## Problem

Found in the production check on 2026-11-11 (issue 13). Every board's
description (main, seed and daily) ended with "Your runs are listed as
Anonymous until you set a leaderboard name in Settings" whenever the player had
not typed a name (`LeaderboardModal.jsx`). Since every player was given an
assigned name, that is false: the check's first daily run went up as
`LostAlmoner3016` with Settings never opened. Only a player who ticks "don't
list a name" is listed as Anonymous.

This is the drift `visual/copy-accuracy.spec.js` exists to catch, on a screen
it did not cover.

## Fix

The description names what the player's runs are actually listed under, from
`useEffectiveName` (the chosen name, else the assigned one): "Your runs are
listed as LostAlmoner3016; change it in Settings." A player who opted out reads
"Your runs are listed as Anonymous, as chosen in Settings."

## Acceptance criteria

- [x] No name chosen: the description names the assigned name, and says
      nothing about Anonymous.
- [x] A chosen name: the description names it.
- [x] Opted out: it says Anonymous.
- [x] Playwright, in `copy-accuracy.spec.js`; the three tests fail on the old
      copy (checked).

## Done (2026-11-11)

+3 e2e tests (board via `page.route`). The comment above the row name, which
said a null name means "never set a handle", now says it means opted out or an
older run. GAME_VERSION unchanged.
