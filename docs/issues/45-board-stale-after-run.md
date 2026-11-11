---
id: 45
title: "Right after a run, the board can still show your previous best"
priority: P3
area: product
effort: S
status: done
branch: issue-43-46-prod-findings
---

## Problem

Found in the production check on 2026-11-11 (issue 13). `/api/leaderboard`
answers with `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`,
so Vercel's edge serves the same URL from cache for a minute and may serve it
stale for five more while it refreshes. A player's board URL is the same before
and after a run (it varies only by board and device), so a player who finishes
a better run and opens *Daily board* straight away can be shown the old row.
The check saw exactly that: after a 0:44 attempt, the board still said 8:28.

The cache is right for everyone else, and the Daily makes it matter more: its
end screen invites a look at the board seconds after every attempt.

## Fix

Bust the cache for the player whose run it is, and only for them, and only
once there is something new to see:

- `historyStore` records when the server last confirmed one of this device's
  runs (`reconcile`) or renames (`claimRun`), in `scoundrel:boardFresh`, and
  fires a `scoundrel:board-fresh` event.
- `fetchLeaderboard` sends that value as `fresh=`, which the server ignores.
  A new value is a URL the edge has not cached, so the first look after a
  confirmed run goes to the database. Other players' URLs do not change.
- The board listens for the event, so a board opened before the run has posted
  refetches the moment it lands.

The value moves only on confirmation, never at run end: busting the cache
before the row exists would fetch the old board and cache it under the new URL.

Not done: lowering `s-maxage`. It would make every request slower to fix one
player's view.

## Acceptance criteria

- [x] A confirmed post (and a confirmed rename) moves the value and fires the
      event; a failed post or an empty queue does not. Unit tests.
- [x] The board request carries `fresh` when there is one, and not otherwise.
- [x] An open board refetches with the new value when the event fires
      (Playwright, board via `page.route`).
- [x] Production: finish a daily attempt, open *Daily board* at once, and see
      the new row within a few seconds (issue 13). -- 2026-11-11, deploy of
      `30225df`: the board's one request carried a `fresh=` value set by the
      run's confirmation, and the new row (`LostAlmoner3017`) was on it

## Done (2026-11-11)

+6 unit (`test/boardFreshness.test.js`), +1 e2e
(`visual/daily-descent.spec.js`). The key stays local: cloud sync copies an
explicit list of keys. GAME_VERSION unchanged.
