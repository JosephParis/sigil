---
id: 24
title: "Mobile tests run twice on every push (duplicated CI workflows)"
priority: P4
area: ci
effort: S
status: open
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

- [ ] One workflow file owns the mobile suite; no duplicate runs on a push
- [ ] Nothing unique to `mobile-tests.yml` was lost
- [ ] Unit tests (issue 15) wired in
- [ ] Playwright report uploaded as an artifact on failure
- [ ] Explicit decision recorded on the `all-tests` trigger scope
- [ ] `test-results/` and `visual-screens/` gitignored
