---
id: 22
title: "Nine session-artifact markdown files cluttering the repo root"
priority: P4
area: hygiene
effort: S
status: done
---

## Problem

The repo root holds 14 markdown files. Nine are transcripts of past working
sessions rather than documentation anyone needs going forward:

- `COMMIT_AND_PUSH.md`
- `FIXING_LINTER_ERRORS.md`
- `MOBILE_OPTIMIZATION_COMPLETE.md`
- `RESPONSIVE_CHANGES_SUMMARY.md`
- `TEST_RESPONSIVE.md`
- `TESTING_MOBILE.md`
- `PLAYWRIGHT_TESTS_SUMMARY.md`
- `GITHUB_ACTIONS_SETUP.md`
- `CI_SETUP_CHECKLIST.md`

The five that carry ongoing value: `REWORK.md` (the design of record),
`DESIGN.md` (stale — see issue 23), `WINRATE_TARGETS.md`,
`RESPONSIVE_AND_PWA_PLAN.md` (issue 04's spec), `EXTENSIONS.md`, `Storyline.md`,
and `MOBILE_UI_IMPROVEMENTS.md`.

## Why it matters

Signal-to-noise for whoever opens this repo next — increasingly, an agent. Files
named `*_COMPLETE.md` and `FIXING_*.md` describe work already finished, but
nothing distinguishes them from live specs at a glance. Worse, several describe
states of the world that no longer hold, so anyone reading them for context gets
misled. This is the same failure mode as issues 10, 14, and 23: stale docs that
look authoritative.

There is also no README to orient anyone (issue 20), so the root listing *is* the
first impression.

## Suggested fix

Don't delete outright — some contain useful reasoning worth keeping searchable.
Move them:

```
docs/archive/
```

with a short `docs/archive/README.md` saying these are historical session notes,
kept for reference, not current documentation, and not to be trusted as a
description of the present codebase.

Before moving each one, check for anything still live:

- **`CI_SETUP_CHECKLIST.md` / `GITHUB_ACTIONS_SETUP.md`** — may document required
  GitHub secrets or setup steps that aren't recorded elsewhere. Fold anything
  still needed into the README (issue 20) first. Relevant to issue 24, which
  untangles the duplicated workflows.
- **`TESTING_MOBILE.md` / `TEST_RESPONSIVE.md` / `PLAYWRIGHT_TESTS_SUMMARY.md`** —
  may describe how to run the Playwright suites. That belongs in the README.
- **`MOBILE_OPTIMIZATION_COMPLETE.md` / `RESPONSIVE_CHANGES_SUMMARY.md`** —
  cross-check against `RESPONSIVE_AND_PWA_PLAN.md`. Part 1 landed only partially,
  so a file claiming completion is exactly the kind of thing that causes issue 04
  to be skipped.

While reorganizing, consider whether `EXTENSIONS.md`, `Storyline.md`, and
`MOBILE_UI_IMPROVEMENTS.md` belong in `docs/` too, leaving the root to README,
LICENSE, and the three live design docs.

## Acceptance criteria

- [x] All nine moved to `docs/archive/` with an explanatory README
- [x] Any still-live setup or test-running instructions folded into the main README first
- [x] Repo root contains only README, LICENSE, and current design docs
- [x] No file in the root claims completion of work that is still outstanding

## Resolution

Landed on `dawn/2026-08-22`, after issue 20, so the README existed to fold
anything live into.

All nine moved to `docs/archive/` with a README that states plainly that nothing
in there is current documentation, tabulates what each file was, and points at
where the live docs are.

**Nothing needed folding into the README first.** Each was checked:

- `CI_SETUP_CHECKLIST.md` / `GITHUB_ACTIONS_SETUP.md` describe GitHub Actions
  setup generically and reference example secrets (`SLACK_WEBHOOK`, `API_KEY`)
  this project does not use. `grep secrets. .github/workflows/*.yml` returns
  nothing — **neither live workflow reads any secret**, so there was no
  undocumented setup step hiding in them. Noted on issue 24, which is unblocked.
- `TESTING_MOBILE.md` / `TEST_RESPONSIVE.md` / `PLAYWRIGHT_TESTS_SUMMARY.md`
  describe running the Playwright suites, now covered by the README script table.

Went slightly further than the nine, per the "consider whether" note: the root
now holds exactly **README, LICENSE and the three live design docs** (`REWORK.md`,
`DESIGN.md`, `WINRATE_TARGETS.md`). `EXTENSIONS.md`, `Storyline.md`,
`MOBILE_UI_IMPROVEMENTS.md` and `RESPONSIVE_AND_PWA_PLAN.md` moved to `docs/` —
they carry ongoing value, so they are not archived, just off the root.

That last one is the judgement call worth flagging: this issue lists
`RESPONSIVE_AND_PWA_PLAN.md` among the files with ongoing value, and it is still
issue 04's reference. It moved to `docs/` rather than `docs/archive/` for exactly
that reason, but it did have to leave the root for the "only README, LICENSE and
the three live design docs" criterion to hold.

Inbound references updated: `README.md`'s documentation map, `REWORK.md:7`, and
the `RESPONSIVE_AND_PWA_PLAN.md` paths in issue 04.

No file left in the root claims completion of outstanding work — the two that did
(`MOBILE_OPTIMIZATION_COMPLETE.md`, `RESPONSIVE_CHANGES_SUMMARY.md`) are archived
and explicitly flagged in the archive README.
