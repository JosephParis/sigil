# Archive — historical session notes

**Nothing in this directory is current documentation. Do not trust any of it as a
description of the present codebase.**

These nine files are transcripts of past working sessions that were sitting in
the repo root, where nothing distinguished them from live specs at a glance.
Several describe states of the world that no longer hold, and files named
`*_COMPLETE.md` are exactly the kind of thing that causes real outstanding work
to be skipped — `MOBILE_OPTIMIZATION_COMPLETE.md` claims completion of work that
issue 04 later had to finish.

They are kept rather than deleted because some contain reasoning worth being able
to search for. They are moved rather than left in place because the root listing
is the first thing a reader — increasingly an agent — sees.

Before archiving, each was checked for anything still live. **Nothing was:** the
two CI documents describe GitHub Actions setup generically and reference example
secrets (`SLACK_WEBHOOK`, `API_KEY`) that this project does not use — neither
`.github/workflows/ci.yml` nor `mobile-tests.yml` reads any secret at all. The
Playwright and mobile-testing documents describe how to run suites that are now
covered by the script table in the root `README.md`.

| File | What it was |
|---|---|
| `CI_SETUP_CHECKLIST.md` | Setting up GitHub Actions. Generic; the live workflows need no secrets. See issue 24 for the duplication between them. |
| `GITHUB_ACTIONS_SETUP.md` | The longer version of the same. |
| `COMMIT_AND_PUSH.md` | Notes from one commit-and-push session. |
| `FIXING_LINTER_ERRORS.md` | A lint cleanup pass, long since done. |
| `MOBILE_OPTIMIZATION_COMPLETE.md` | ⚠ Claims mobile work complete. Part 1 of `RESPONSIVE_AND_PWA_PLAN.md` had landed only partially at the time. |
| `RESPONSIVE_CHANGES_SUMMARY.md` | Companion to the above, same caveat. |
| `TESTING_MOBILE.md` | How to run the mobile suites — superseded by the README script table. |
| `TEST_RESPONSIVE.md` | Same. |
| `PLAYWRIGHT_TESTS_SUMMARY.md` | A snapshot of the Playwright suites at one point in time. The current counts are in `docs/issues/README.md`. |

## Where the live documentation is

- **`REWORK.md`** (repo root) — the design of record
- **`README.md`** (repo root) — setup, scripts, env vars, architecture
- **`docs/issues/`** — the launch-readiness backlog
- **`docs/RESPONSIVE_AND_PWA_PLAN.md`** — issue 04's spec, still the reference
  for the responsive/PWA work
