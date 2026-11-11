---
id: 42
title: "No Daily Descent: nothing gives everyone the same dungeon on the same day"
priority: P2
area: product
effort: M
status: done
branch: issue-42-daily-descent
---

## Problem

Seeds (38) and challenge links (39) let two friends race one dungeon, but only
when one of them sends the other a link. There is no seed that everyone is on
at once, and so no reason to come back tomorrow. `DESIGN.md` §7 has listed a
daily seed as "never built" from the start.

## Decided (Joey, 2026-10-22)

Phase 2 of the seed plan in issue 40, approved in full, with one change:

- **The seed comes from the UTC date.** Everyone on Earth has the same daily
  at the same moment, and it changes at 00:00 UTC.
- **Unlimited attempts.** The plan said one scored attempt and then practice.
  Joey: "Daily shouldn't be only 1 attempt, you should be able to try it again
  and again." Every attempt counts, and the board keeps each player's best.
- **A daily board ranked by sigils, then time.** Most sigils first; among
  equal sigils, the fastest. Deaths count, since a daily is a race to get
  deepest, not only to escape.

Phase 3 (weekly runs with twists, word seeds, streaks) is parked, not
declined: it is written down in `docs/EXTENSIONS.md` §8 for later.

## Design

- **The seed.** `dailySeed('2026-10-22')` derives an ordinary 8-character code
  from the date (`seed.js`), so everything a seed already does (the seed
  board, the link, history) works on it unchanged. The server can recompute
  it, so an uploaded record cannot claim a date its seed does not match.
- **The rules are fixed.** Default mode, ascension 0, whatever the player has
  unlocked, so every attempt and every player is in one race. The opening
  visit hides the mode and ascension pickers on a daily.
- **The run carries the date** (`daily: 'YYYY-MM-DD'`, set when the run
  starts). A run started at 23:58 UTC counts for the day it started.
- **Off the main board.** A daily is `seedChosen`: a player who has seen the
  dungeon before has a head start, the same reason an entered seed is kept off
  it.
- **The board.** `GET /api/leaderboard?daily=YYYY-MM-DD`: every finished
  attempt on that date with at least one sigil, one row per player (their best
  by sigils, then time), under the same dev, blocklist and identity rules as
  the main board. The 60-second floor applies to victories, as on the main
  board; any listed run must have entered at least as many rooms as it has
  sigils.
- **Entry points.** The opening visit gets *Play today's Daily*. A daily's end
  screen offers *Try the Daily again* and *Daily board*, and names the day.
- **History** labels a daily run with its date.

## Not in scope

- A streak, or any count of days played (Phase 3).
- A daily for other modes or ascensions.
- A local "best today" without the server: the board is the record.

## Acceptance criteria

- [x] `dailySeed` is deterministic, canonical (`normalizeSeed` returns it
      unchanged) and differs day to day; unit tests.
- [x] Starting the daily twice on one day gives the same seed; the run has
      `daily`, `seedChosen`, default mode and ascension 0, and the pickers are
      hidden.
- [x] The record carries `daily`; the validator rejects a malformed date
      (`bad_daily`) and a date whose seed does not match (`daily_seed_mismatch`).
- [x] The daily board ranks sigils desc, then time, one row per player, deaths
      included, rows with no sigil left out, other days left out; a bad date is
      a 400. Handler unit tests.
- [x] The end screen of a daily offers another attempt and the daily board,
      and the board renders sigils and time (Playwright, board via `page.route`).
- [x] `DESIGN.md` §7 and `EXTENSIONS.md` §8 say what shipped, and park Phase 3.
- [x] `npm run lint && npm run build && npm run test` green.
- [x] Prod-only checks (the board against the real database) added to issue 13.

## Done (2026-11-11)

What shipped matches the Design section above. Notes on the choices made
while building:

- **`seed.js`**: `dailySeed(date)`, `isDailyDate`, `todayUtc` and
  `formatDaily` (the day named in UTC, so the label matches its board).
  365 days of 2026 give 365 different seeds.
- **The run** (`lifecycle.js`): `createRun` takes `daily`; the mode and
  ascension setters refuse on a daily; entering another seed drops it.
  `dailyRun()` in `index.jsx` starts one past the tutorial, on default rules,
  as an entered seed.
- **The board** (`api/leaderboard.js`, `?daily=`): a separate ranked query,
  `rankedDaily`, rather than more branches in `rankedBest`, so the main
  board's query is untouched. Every outcome counts (retired too: it is a
  finished attempt), sigils at least 1, the 60s floor on victories only, rooms
  at least sigils, the day's seed matched as well as the date, same dev,
  blocklist and guest-by-device rules. A bad date is a 400 `bad_daily`.
- **Screens**: *Play today's Daily* on the opening visit, with the mode,
  ascension and seed pickers hidden once it is chosen and *Play your own
  dungeon instead* to leave it. A daily's end screen names the day and offers
  *Try the Daily again* (or *Play today's Daily* if the day has turned over)
  and *Daily board*, which shows sigils beside each time. The
  challenge-a-friend panel stays off a daily. The leaderboard-name nudge now
  also shows on a daily death with a sigil, since that run is listed. Run
  history labels a daily with its date. The standalone build plays the Daily
  but offers no board, like the seed board.
- **Not done**: replaying an old daily from history uses *Play this seed*
  (issue 41), which starts it as an ordinary entered seed, not as that day's
  daily, so it cannot post to an old board.
- **Tests**: +21 unit (`seed.test.js` 10, `validate.test.js` 3,
  `leaderboard.handler.test.js` 8) and +5 e2e (`visual/daily-descent.spec.js`,
  board via `page.route`). Issue 13 has seven new prod-only checks.
- **Gate**: lint and build clean; 795 unit pass; 233 e2e pass, 1 known skip.
  Two existing flakes surfaced under load on 2026-11-11 and both reproduce on
  `main` without this change: `assignedName`'s 60,000-name slur sweep crossed
  vitest's 5s default (given a 30s budget in its own commit), and
  `device-lab`'s verdict test sometimes reports a 59px scroll (2 of 4 runs with
  this change, 2 of 4 without).
- **GAME_VERSION: unchanged.** No balance is touched; `0.4` stays.
