---
id: 24
title: "Mobile tests run twice on every push (duplicated CI workflows)"
priority: P4
area: ci
effort: S
status: done
---

## Problem

Two workflow files run the same Playwright mobile suite on identical triggers:

- **`.github/workflows/ci.yml`** — jobs `lint-and-build`, `mobile-tests`, and
  `all-tests` (the last restricted to main/master)
- **`.github/workflows/mobile-tests.yml`** — duplicates the `mobile-tests` job

Every push runs the mobile suite twice, doubling CI minutes and producing two sets
of results for one commit. When they disagree — flaky screenshot comparison,
timing — it's ambiguous which run is authoritative.

## Suggested fix

Delete `.github/workflows/mobile-tests.yml` and keep `ci.yml` as the single entry
point. Check first whether the standalone file has anything `ci.yml` lacks — a
different browser matrix, artifact upload on failure, a `workflow_dispatch`
trigger for manual runs — and port it over before deleting.

While consolidating:

- **Add the unit tests from issue 15** once vitest is in. That's the main reason
  to tidy this up now rather than later: a clean single workflow is the place to
  add `test:unit`.
- **Upload Playwright artifacts on failure** (`playwright-report/`,
  `test-results/`) if not already configured. A failed screenshot comparison is
  nearly undebuggable without the diff images.
- **Reconsider the `all-tests` main-only restriction.** Running the full suite
  only on main means a PR can look green and break on merge. If it's slow,
  `workflow_dispatch` plus a nightly schedule is a better trade than
  main-only.
- Confirm `node_modules` and the Playwright browser download are cached — both are
  significant per-run costs.
- Note `test-results/` and `visual-screens/` exist in the working tree; confirm
  they're gitignored so CI output doesn't get committed.

Then fold any still-relevant setup notes from `CI_SETUP_CHECKLIST.md` and
`GITHUB_ACTIONS_SETUP.md` into the README before issue 22 archives them.

**Update (issue 22, 2026-08-22):** both were checked and archived to
`docs/archive/`. Nothing needed folding in — they describe GitHub Actions setup
generically and reference example secrets (`SLACK_WEBHOOK`, `API_KEY`) this
project does not use. Neither `ci.yml` nor `mobile-tests.yml` reads any secret,
so there is no undocumented setup step hiding in them. This issue is unblocked.

## Acceptance criteria

- [x] One workflow file owns the mobile suite; no duplicate runs on a push
- [x] Nothing unique to `mobile-tests.yml` was lost
- [x] Unit tests (issue 15) wired in
- [x] Playwright report uploaded as an artifact on failure
- [x] Explicit decision recorded on the `all-tests` trigger scope
- [x] `test-results/` and `visual-screens/` gitignored

## Resolution

Closed on `dawn/2026-09-02`. `.github/workflows/mobile-tests.yml` is deleted;
`ci.yml` is the single entry point. Nothing was lost with it — the two jobs ran
the same `npm run test:mobile` on the same chromium install and the same
triggers, and `ci.yml`'s copy already uploads `playwright-report/` always and
`test-results/` on failure. The standalone file's only differences were its
artifact names and a shorter timeout.

Unit tests were already wired into `lint-and-build` (they arrived with issue
15), and `test-results/`, `visual-screens/`, `playwright-report/` and
`.playwright/` are all gitignored.

**Decision on `all-tests` scope:** it stays off per-push branch builds. It is
~20 minutes of browser time, and the `mobile-tests` job already covers the
surface that actually breaks on a push. The gap — a PR looking green and failing
on merge — is closed by adding a **nightly schedule (07:00 UTC)** and
**`workflow_dispatch`**, which is the trade this issue proposed. The job's `if`
now admits all three: schedule, manual dispatch, and pushes to main/master.
Revisit if a merge ever breaks something the nightly then catches hours later.
