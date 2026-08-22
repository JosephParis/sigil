# Launch-readiness backlog

28 issues, scoped against one milestone: **sending the game to the first batch of
users.** Issues 01–25 came from a read-only audit of the codebase, API layer, and
markdown docs; issue 26 surfaced when the full test suite was actually run, and
issue 28 came from playing it.

Baseline: `npm run lint` clean, `npm run build` clean. Test suite as it stands:

| Suite | Runner | Status |
|---|---|---|
| `test/validate.test.js` | vitest | 42 pass |
| `test/runs.handler.test.js` | vitest | 16 pass |
| `test/rateLimit.test.js` | vitest | 13 pass |
| `test/audio.test.js` | vitest | 7 pass |
| `test/pseudonym.test.js` | vitest | 6 pass |
| `test/combat.test.js` | vitest | 78 pass |
| `test/lifecycle.test.js` | vitest | 56 pass |
| `test/dedupeKeys.test.js` | vitest | 40 pass |
| `test/sanctuary.test.js` | vitest | 37 pass |
| `test/history.test.js` | vitest | 33 pass |
| `test/deck.test.js` | vitest | 32 pass |
| `test/themes.test.js` | vitest | 31 pass |
| `visual/privacy.spec.js` | dev | 9 pass |
| `visual/head-and-manifest.spec.js` | dev | 11 pass |
| `visual/audio-assets.spec.js` | dev | 5 pass |
| `visual/bare-hands-layout.spec.js` | dev | 7 pass |
| `screens.spec.js` | dev | 6 pass (1 known skip — issue 12) |
| `mobile-responsive-simple.spec.js` | dev | 12 pass |
| `tutorial-walkthrough.spec.js` | dev | 1 pass |
| `dev-tools-gate.prod.spec.js` | prod | 6 pass |
| `error-boundary.prod.spec.js` | prod | 8 pass |
| `mobile-responsive.spec.js` | dev | 27 pass |

**Full suite: 391 unit + 92 e2e passed, 1 skipped (`card-library`, issue 12).**

The unit half went 84 → 391 with issue 15. The rules engine now has real
coverage: `combat.js`, `lifecycle.js`, `logic/sanctuary.js`, `deck.js`,
`themes.js`, `history.js` and the run-dedupe keys. Shared fixtures (a seeded
rng and the state factories) live in `test/support/state.js` — start there
rather than hand-rolling a state literal.

## Testing convention

Write the test in the **same change as the fix**, not as a follow-up. If the
harness cannot reach the behavior, extend the harness as part of that work.

Pick the cheapest runner that can actually assert the thing:

- **vitest** (`test/`) for pure logic and serverless handlers. Handlers are
  testable by stubbing the Neon client — see `test/runs.handler.test.js`.
- **Playwright `dev` project** for UI against the dev server.
- **Playwright `prod` project** for anything that only holds in a production
  build (e.g. gated on `import.meta.env.DEV`). Name it `*.prod.spec.js` and it
  runs against `vite preview`. See `visual/dev-tools-gate.prod.spec.js`.

Commands:

- `npm run test` — everything (unit, then e2e)
- `npm run test:unit` / `npm run test:unit:watch`
- `npm run test:e2e`, `npm run test:dev`, `npm run test:prod`

Two traps that have already bitten, both producing tests that pass for the wrong
reason:

- `page.goto` resolves on `load`, but the game is behind a lazy import — wait for
  a real element before asserting on anything the app writes.
- `addInitScript` re-runs on **every** navigation. Any key the test mutates must
  be set with `page.evaluate` after the first load, or a reload resurrects it.

Where an assertion's meaning depends on the environment, assert the environment
too (see the coarse-pointer guard in `mobile-responsive.spec.js`).

One file per issue, each self-contained: problem, evidence with `file:line`,
why it matters for batch 1, suggested fix, acceptance criteria. You should not
need to re-derive the audit to work one.

## How to work an issue

1. Pick one whose dependencies are met (see the graph below).
2. Set `status: in-progress` in its frontmatter, and add your branch name.
3. Read the linked files before changing them — several issues note that the
   *code* is right and the *docs* are wrong. Don't "fix" correct code to match a
   stale spec.
4. Work the acceptance criteria as a checklist.
5. `npm run lint && npm run build && npm run test` before you're done.
6. Set `status: done` and record any decision the issue asked you to record.

Done so far: **05** (tree clean, `GAME_VERSION` now `0.4`), **01** (dev tools
gated), **26** (suite green and runnable), **02** (error boundary), **07** (write
endpoints hardened; vitest added, which partly advances 15), **06** (privacy
policy; PostHog no longer receives PII), **04** (icons, manifest, social cards),
**28** (bare-hands button no longer covers the weapon preview), **16** (audio
payload halved), **19** (`robots.txt` + admin `noindex`), **15** (unit tests
over the game logic), **09** (the `merge.js` dedupe key that dropped runs —
closed alongside 15, whose agreement test could not pass while it was broken),
**21** (`.env` now ignored; nothing had leaked), **20** (README, LICENSE and
`.env.example`), **22** (nine session docs archived to `docs/archive/`).

**All P0 blockers are closed.** Live at **https://sigildeck.com** since
2026-08-06, with the privacy mailbox, auth and DNS all verified against the
deployment (see issue 13).

The repo root is now **README, LICENSE and the three live design docs**
(`REWORK.md`, `DESIGN.md`, `WINRATE_TARGETS.md`). Everything else moved under
`docs/` — see `docs/archive/README.md` for the historical session notes, which
are kept but are **not** current documentation.

**The open risk before widening access is issue 08.** Leaderboard handles are
player-supplied and public, and there is no way to remove an abusive one — no
block, no delete, no audit. That is the thing that changes character the moment
strangers rather than friends are playing.

## The game is now called Sigil

Renamed from Scoundrel — the old name belonged to the 2011 card game this is built
on, and there is now a same-genre Steam title using it too.

A **sigil** is what a run is spent collecting: `SIGIL_TARGET` is 10, the sanctuary
counts them along the rail, and the outcome screen reports how many were set. The
title names the win condition, and the favicon mark was already a sigil before the
rename, so the identity is now one thing rather than two.

It briefly went out as **Knell** (2026-07-30 to 08-03) and that name did not stick.
Two collisions were weighed and accepted: Romero's SIGIL Doom megawad, and *SIGIL
the GPS RPG*, which holds `sigilgame.com` and `playsigil.com`. Different genres,
no legal exposure — but **do not register a domain that near-misses theirs**, or
players will land on a location-based RPG.

The rename touched **user-facing surface only**. Deliberately left alone, because
they are live data or internal paths and renaming them would orphan every player's
save for no visible gain:

- the `scoundrel:` localStorage prefix (saves, tutorial flag, boon library, flags,
  session token, pending run queue) — see the comment at the top of
  `src/games/scoundrel/index.jsx`
- `accountId` values already stored server-side
- the `src/games/scoundrel/` module path, and `_scoundrelFailed` in `audio.js`
- the boon **"Scoundrel's Cloak"** — a character archetype, not the title

The GitHub repo is now **`JosephParis/sigil`** (renamed 2026-08-08). `REPO` in
`src/VersionBadge.jsx` and the fetch user-agent in `scripts/build-bell-cues.sh`
follow it. The **working directory is still `apps/scoundrel`** and stays that
way — same reasoning as the module path.

**Issue 13 has grown into the real pre-launch gate.** Everything that cannot be
tested locally has been pushed onto its checklist, because there is no `/api` in
`vite dev` or `vite preview` and no scraper or mobile device in the harness. Two
items there are not optional:

- **Create the privacy contact mailbox** (`src/privacyContact.js`). The policy
  lists an address that does not exist yet, so deletion requests would vanish.
- **Confirm signed-in players are not being 401'd** by the hardened write
  endpoints. That is the one regression that would silently stop recording every
  signed-in run.

Issue 02 left one gap, now tracked as **issue 27**: there is still no save reset
outside the crash path, so a run that gets *stuck* without throwing has no escape
hatch. That is the more likely of the two failure modes.

Note for anything touching gameplay: 05 opened version `0.4`, so runs recorded
from here on stamp `0.4`. If you make another balance-affecting change before
launch, decide whether it needs its own entry or can share `0.4` — nothing has
shipped to users on `0.4` yet, so sharing is usually fine.

## Priorities

- **P0** — visible to every user on day one, or legally required. Do before launch.
- **P1** — data integrity and abuse. The link is public the moment you send it.
- **P2** — product decisions that need an explicit answer, not a default.
- **P3** — quality, performance, accessibility.
- **P4** — repo hygiene and doc accuracy.

## The backlog

### P0 — blockers

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [01](01-gate-dev-tools.md) | Gate Dev tools behind a non-obvious flag | launch-blocker | S | **done** |
| [02](02-error-boundary-and-recovery.md) | Add an error boundary and an always-available save reset | launch-blocker | M | **done** |
| [03](03-missing-victory-gameover-music.md) | `victory.mp3` / `gameover.mp3` registered but missing | content | S | **done** |
| [04](04-html-head-favicon-manifest-meta.md) | No favicon, manifest, description, or OG tags | launch-blocker | M | **done** |
| [05](05-uncommitted-wip.md) | Commit or shelve the 4-file uncommitted tree | process | S | **done** |
| [06](06-privacy-policy.md) | No privacy policy despite Google sign-in + PostHog `identify` | legal | M | **done** |

### P1 — data integrity and abuse

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [07](07-unauthenticated-write-endpoints.md) | `/api/runs` + `/api/feedback` accept unauthenticated writes | security | M | **done** |
| [08](08-moderation-tools.md) | No moderation path for handles, rows, or feedback | security | M | open |
| [09](09-merge-runseed-dedupe-bug.md) | **BUG** `merge.js` omits `runSeed`, dropping runs on sync | bug | S | **done** |
| [10](10-stale-db-schema.md) | `db/schema.sql` no longer describes the database | docs | S | open |
| [26](26-dead-mobile-responsive-spec.md) | **BUG** all 25 tests in `mobile-responsive.spec.js` were dead | testing | M | **done** |
| [28](28-bare-hands-covers-weapon-preview.md) | **BUG** bare-hands button covers the weapon preview | bug | S | **done** |

### P2 — product decisions

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [11](11-feature-flag-defaults.md) | Decide feature flag defaults (6 of 7 off) | product | S | open |
| [12](12-unreachable-glossary-and-card-library.md) | Card library + Boons/Trials glossary unreachable | product | S | open |
| [13](13-verify-admin-stats-in-prod.md) | Verify `/api/stats` + `/admin` in prod before inviting anyone | product | S | open |
| [14](14-anonymous-handle-copy-mismatch.md) | **BUG** UI promises "Anonymous" listing; server excludes it | bug | S | open |
| [27](27-save-reset-outside-crash-path.md) | No save reset for a run stuck without crashing | product | S | open |

### P3 — quality, performance, accessibility

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [15](15-unit-tests-game-logic.md) | No unit tests over ~100KB of game logic | testing | L | **done** |
| [16](16-audio-payload.md) | ~31MB audio, ~17MB byte-identical duplicates | performance | S | **done** |
| [17](17-prefers-reduced-motion.md) | No `prefers-reduced-motion`; 4 infinite animations | accessibility | S | open |
| [18](18-google-fonts-blocking-import.md) | Render-blocking Google Fonts `@import` | performance | S | open |
| [19](19-robots-txt.md) | No `robots.txt` while `/admin` is live | hygiene | S | **done** |

### P4 — hygiene and doc accuracy

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [20](20-readme-license-env-example.md) | No README, LICENSE, or `.env.example` | docs | M | **done** |
| [21](21-gitignore-env.md) | `.gitignore` misses `.env` while docs point at it | security | S | **done** |
| [22](22-archive-session-docs.md) | Nine session-artifact docs in the repo root | hygiene | S | **done** |
| [23](23-stale-design-md.md) | `DESIGN.md` contradicts the shipped game | docs | M | open |
| [24](24-duplicate-ci-workflows.md) | Mobile tests run twice per push | ci | S | open |
| [25](25-rules-copy-review.md) | Review rules copy against the post-rework game | docs | S | open |

## If you only do five

**01** (dev tools), **02** (error boundary), **03** (missing music), **07**
(unauthenticated writes), **15** (unit tests).

01–03 are visible to every user on day one. 07 and 15 are what make the data you
collect from batch 1 worth acting on.

## Dependencies

```
05 (commit WIP) ──> everything else
                    │
07 (auth writes) ──>├─ 08 (moderation: needs a trusted accountId to block)
                    │
10 (schema) ───────>├─ 08 (needs a `blocked` column)
                    │
15 (vitest) ───────>├─ 24 (wire test:unit into CI)
09 (dedupe bug) ───>┘    (09's acceptance criteria want a test)

23 (DESIGN.md) ────> 25 (rules copy) ──┐
                                       ├─ audit content together
12 (unhide tabs) ─────────────────────>┘

11 (flag defaults) ──> 13 (measurement window)   settle flags before opening it
12 (library tab) ────> 11 (needs `library: true`)

20 (README) ───────> 22 (fold live setup notes in before archiving)
21 (.gitignore) ───> 20 (.env.example must stay trackable)

03 (music) <───────> 16 (audio cleanup: mourning-song.ogg may become gameover)
04 (manifest) ─────> 19 (indexing decision)
06 (privacy) <─────> 18 (Google Fonts is a disclosure item)
```

## Pushing these to GitHub

`gh` was not installed when this backlog was written, so these live in the repo
rather than as GitHub issues. To push them:

```powershell
winget install GitHub.cli
gh auth login
./scripts/create-github-issues.ps1 -DryRun   # preview
./scripts/create-github-issues.ps1           # create
```

The script reads every `docs/issues/NN-*.md`, creates one GitHub issue per file
with `priority:*` and area labels, and skips any already marked
`status: done`. It does not delete these files — they stay as the offline copy.
