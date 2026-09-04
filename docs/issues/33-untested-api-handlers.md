---
id: 33
title: "Five API handlers have no tests, including the one that can lose a save"
priority: P3
area: testing
effort: L
status: done
---

## Problem

Issue 15 put the rules engine under test and issue 08 added the first handler
tests. Four handlers are covered — `runs`, `claim`, `leaderboard`, `moderation`.
Five are not:

| Handler | Lines | What is untested |
|---|---|---|
| `api/save.js` | 84 | The whole cross-device sync path |
| `api/stats.js` | 284 | Every aggregate `/admin` reads, and its auth gate |
| `api/auth.js` | 37 | Google credential -> session token exchange |
| `api/feedback.js` | 90 | Auth gate, rate limit, insert |
| `api/cron-backfill-runs.js` | 86 | The weekly backfill, and who may call it |

`api/_lib/merge.js` is exercised indirectly through `dedupeKeys.test.js`, but
`mergeProfiles` itself — the function that decides what a player keeps — has no
direct coverage.

## Why it matters for batch 1

`api/save.js` is the one that can **silently lose progress**. It read-merge-writes
a single jsonb blob per account, so a wrong merge does not error: it returns a
smaller profile, the client writes it back over local storage
(`applyCloudState`), and unlocks are gone with nothing to notice. There is no
`/api` in `vite dev`, so no e2e test can reach any of this; unit tests over the
handlers are the only coverage that exists at all.

`api/stats.js` is the other one that matters now — it is how you watch batch 1
(issue 13), and a broken aggregate is only discovered while the cohort is
already playing.

## Suggested fix

Copy the pattern in `test/runs.handler.test.js`: set env at module scope, mock
`@neondatabase/serverless` with a tagged-template stand-in that records queries
and answers the ones the handler branches on, then import the handler.

Rough shape, one file each:

- **`save.handler.test.js`** — 401 without a session; account comes from the
  token and never the body; GET returns the stored blob; POST merges and returns
  the union; a rejected body shape; 503 without `DATABASE_URL` / `SESSION_SECRET`.
- **`merge.profiles.test.js`** — direct over `mergeProfiles`: unlocks union,
  ascension max, tutorial OR, history keyed and capped at 200, `save`
  newest-wins, and **convergence** (merging in either order gives the same
  result). This is the highest-value file in the issue; write it first.
- **`stats.handler.test.js`** — the `ADMIN_TOKEN` bearer gate, `dev is not true`
  filtering, and the `game_version` range filter.
- **`auth.handler.test.js`** — a bad credential is refused, a good one mints a
  session, 503 without config. Mock the Google verification (`api/_lib/google.js`).
- **`feedback.handler.test.js`** — auth gate, rate limit, insert shape.
- **`cron.handler.test.js`** — accepts `CRON_SECRET` or `ADMIN_TOKEN`, refuses
  anything else.

**This issue is built to be interrupted.** Each file is independent and every
one committed is real coverage, so a run that gets through two of six has
genuinely advanced it. Write `merge.profiles.test.js` and `save.handler.test.js`
first — they cover the only path that can destroy player data.

## Acceptance criteria

- [x] `mergeProfiles` covered directly, including order-independence
- [x] `/api/save` covered: auth gate, account-from-token, GET, POST, bad body,
      unconfigured env
- [x] `/api/stats` covered: admin gate, dev filtering, version range
- [x] `/api/auth`, `/api/feedback`, `/api/cron-backfill-runs` each have a file
- [x] The README's test-count table updated to the new totals
- [x] Anything that turns out to be provable only against the real database is
      added to issue 13 rather than dropped

## Resolution

Closed on `dawn/2026-09-02`. Six files, 74 cases, all vitest against a Neon
stand-in (or, for `/api/auth`, a stubbed `fetch` driving the real
`verifyGoogleCredential` rather than mocking the trust boundary away):

| File | Cases | Covers |
|---|---|---|
| `test/merge.profiles.test.js` | 14 | union / max / OR fields, run-identity dedupe, the 200 cap, newest-wins saves, convergence, idempotence, a corrupted blob |
| `test/save.handler.test.js` | 14 | 405, four 401 paths, GET, POST merge + persist, account-and-email from the token, string bodies, invalid payloads leaving the row untouched, 500 |
| `test/stats.handler.test.js` | 14 | admin gate, unset-token 503, dev filtering, version list parsing and parameter binding, missing feedback table, 500 |
| `test/feedback.handler.test.js` | 13 | auth gate, rate limit ahead of body parsing, message trim/cap, kind whitelist, context and version nulling, 500 |
| `test/auth.handler.test.js` | 11 | 405, 503 per missing env var, 400, session minting, audience check, email_verified in both spellings, tokeninfo and network failure |
| `test/cron.handler.test.js` | 8 | CRON_SECRET and ADMIN_TOKEN accepted, everything else 401, neither configured 503, idempotence clause, 500 |

Unit total 578 -> 652.

`test/stats.handler.test.js` needed a fake client that renders **nested** `sql`
fragments the way neon flattens them; the composed `runs` subquery is not
assertable otherwise. Reuse that helper rather than rebuilding it if another
handler starts composing fragments.

Left to issue 13, as the last acceptance criterion asks: whether the stats
aggregations compute the right numbers, and whether the backfill's
insert-select folds the right rows across. Both are SQL against real data and no
stand-in can prove them.
