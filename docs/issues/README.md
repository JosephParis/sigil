# Launch-readiness backlog

37 issues, scoped against one milestone: **sending the game to the first batch of
users.** Issues 01–25 came from a read-only audit of the codebase, API layer, and
markdown docs; issue 26 surfaced when the full test suite was actually run, and
issue 28 came from playing it. **Issues 29–36 came from a second full read on
2026-08-31**, after the leaderboard-name work landed: a re-audit of the rules
engine, the sync seam, the API surface and the payload, run against a green
suite rather than a broken one. **Issue 37 came out of a workflow review on
2026-09-01**: the balance spec is the only design doc in the repo with no
instrument that can fail it.

Baseline: `npm run lint` clean, `npm run build` clean. Test suite as it stands:

| Suite | Runner | Status |
|---|---|---|
| `test/validate.test.js` | vitest | 42 pass |
| `test/runs.handler.test.js` | vitest | 22 pass |
| `test/rateLimit.test.js` | vitest | 13 pass |
| `test/audio.test.js` | vitest | 13 pass |
| `test/pseudonym.test.js` | vitest | 6 pass |
| `test/combat.test.js` | vitest | 78 pass |
| `test/lifecycle.test.js` | vitest | 57 pass |
| `test/dedupeKeys.test.js` | vitest | 40 pass |
| `test/sanctuary.test.js` | vitest | 40 pass |
| `test/history.test.js` | vitest | 37 pass |
| `test/deck.test.js` | vitest | 32 pass |
| `test/themes.test.js` | vitest | 31 pass |
| `test/handleDenylist.test.js` | vitest | 41 pass |
| `test/moderation.handler.test.js` | vitest | 24 pass |
| `test/leaderboard.handler.test.js` | vitest | 22 pass |
| `test/merge.profiles.test.js` | vitest | 14 pass |
| `test/save.handler.test.js` | vitest | 14 pass |
| `test/stats.handler.test.js` | vitest | 14 pass |
| `test/feedback.handler.test.js` | vitest | 13 pass |
| `test/auth.handler.test.js` | vitest | 11 pass |
| `test/cron.handler.test.js` | vitest | 8 pass |
| `test/claim.handler.test.js` | vitest | 22 pass |
| `test/assignedName.test.js` | vitest | 17 pass |
| `test/handles.test.js` | vitest | 21 pass |
| `test/leaderboard.test.js` | vitest | 5 pass |
| `test/designDocs.test.js` | vitest | 15 pass |
| `test/audioSession.test.js` | vitest | 4 pass |
| `visual/copy-accuracy.spec.js` | dev | 16 pass |
| `visual/leaderboard-name.spec.js` | dev | 12 pass |
| `visual/itch-build.spec.js` | dev | 11 pass |
| `visual/robots-and-payload.spec.js` | dev | 8 pass |
| `visual/privacy.spec.js` | dev | 11 pass |
| `visual/save-reset.spec.js` | dev | 4 pass |
| `visual/head-and-manifest.spec.js` | dev | 11 pass |
| `visual/audio-assets.spec.js` | dev | 5 pass |
| `visual/bare-hands-layout.spec.js` | dev | 8 pass |
| `screens.spec.js` | dev | 6 pass (1 known skip — issue 12) |
| `mobile-responsive-simple.spec.js` | dev | 12 pass |
| `tutorial-walkthrough.spec.js` | dev | 1 pass |
| `dev-tools-gate.prod.spec.js` | prod | 6 pass |
| `error-boundary.prod.spec.js` | prod | 8 pass |
| `mobile-responsive.spec.js` | dev | 31 pass |
| `visual/mobile-no-scroll.spec.js` | dev | 35 pass |
| `visual/device-lab.spec.js` | dev | 4 pass |
| `visual/mobile-touch.spec.js` | dev | 3 pass |

**Full suite: 656 unit + 192 e2e passed, 1 skipped (`card-library`, issue 12).**
**Both halves re-measured 2026-08-31** on `main` at `1be2684` — 576 unit,
192 e2e, one skip, with lint and build clean. The table above
had drifted — five suites ran without being listed and three counts were wrong —
so it was rebuilt from the runners' own output and is now complete. Keep it that
way, or delete it and keep only this line: the totals are the baseline that
matters, and a new failure or a second skip is a regression.

The unit half went 84 → 391 with issue 15, and 391 → 491 with issue 08, which
added the handle denylist and put the two public-facing handlers — moderation
and the leaderboard — under test for the first time. The rules engine now has real
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

**The design docs are under test too.** `test/designDocs.test.js` holds
`DESIGN.md` and `REWORK.md` to the constants and functions they describe, which
is how issue 23's "seven sigils" would have been caught the day it became false.
If you change the sigil target, the starting kit or the Forge's rank cap, that
file fails until the prose is updated with it.

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
`.env.example`), **22** (nine session docs archived to `docs/archive/`), **27** (a stuck run can
be discarded from Settings, which the home menu now reaches), **10** (`db/schema.sql`
describes all five tables), **08** (moderation: a handle denylist enforced
server-side, `/api/moderation` behind `ADMIN_TOKEN`, and block / delete controls
on `/admin`), **25** (rules copy reviewed), **23** (`DESIGN.md` marked superseded
and corrected; `REWORK.md` named as the design of record and its last open
decision closed), **29** (the Forge opens on every return again, the A0 cadence
now derived from `SIGIL_TARGET`), **33** (every API handler under test — the
save/sync path, the admin stats gate, the Google exchange, feedback and the
backfill cron; unit total 578 → 652), **36** (`db/schema.sql`'s header lists
all six tables, and the suite now holds it to the DDL in `api/`), **24** (one
CI workflow owns the mobile suite; the full suite runs nightly and on demand
rather than only on main).

**All P0 blockers are closed.** Live at **https://sigildeck.com** since
2026-08-06, with the privacy mailbox, auth and DNS all verified against the
deployment (see issue 13).

The repo root is now **README, LICENSE and the three live design docs**
(`REWORK.md`, `DESIGN.md`, `WINRATE_TARGETS.md`). Everything else moved under
`docs/` — see `docs/archive/README.md` for the historical session notes, which
are kept but are **not** current documentation.

**Issue 08 closed the moderation gap.** Handles are screened server-side, an
admin can block an account or delete a single row from `/admin`, and blocked
accounts are subtracted from the public board without touching anyone's save.
Two caveats before that counts as settled: none of it has been exercised against
production yet — the panel makes no real request in `vite dev`, so the round trip
sits on issue 13's checklist — and the word lists are a floor that catches the
lazy attempt, not a filter that holds against a determined one. The blocklist and
the row delete are the actual answer to what gets through.

**Merging 08 settled one thing it could not have known about.** The branch was
cut on 2026-08-23 and assumed a screened handle kept the run off the board,
because stripping the name did exactly that at the time. `b9ad068` (2026-08-25)
reversed issue 14 in parallel, so an unnamed row is now listed as Anonymous, and
a screened run therefore *places* — without a name. That is the behaviour that
was kept: the abusive string is what must never be published, and the victory
itself is not the offence. Taking the row off the board as well is a moderator's
call, which is what `/api/moderation` is for. The Settings copy says so rather
than implying the run is lost, and `visual/copy-accuracy.spec.js` asserts both
halves — that the name is refused, and that the run still appears as Anonymous.

## Every player has a leaderboard name

Added 2026-08-30, after issues 08 and 27 landed. Not from the backlog — it came
out of looking at what the board would actually show batch 1.

**The problem.** `b9ad068` made a nameless victory list as "Anonymous" rather
than vanish, which fixed the disappearing-run bug and created a cosmetic one: a
board where most rows read "Anonymous" looks broken. Worse, it was not only
cosmetic. Every unnamed guest shares `account_id 'guest'` and coalesces to the
same empty handle, so `api/leaderboard.js` put all of them in **one bucket and
showed a single row for the lot** — the second-fastest unnamed guest never
appeared at all.

**The fix, in two halves.**

- *The default.* `src/games/scoundrel/assignedName.js` gives every device a name
  on first launch — `Ashen Vagrant 47` — from the same vocabulary as the
  analytics pseudonyms, seeded by a random per-device id. Nobody is stopped to
  fill in a field, nobody faces a blank one, and guests are distinguishable on
  the board because their names differ.
- *The edit.* The victory screen names itself inline: it states the name the run
  went up under and offers three suggestions plus a free field. It used to link
  to Settings, which spent the one moment a player cares about their name
  sending them somewhere else. **Settings keeps the same control** — it is where
  you can always find it, and it now also holds the opt-out.

**Three states, not two.** Assigned (default), custom (typed), and an explicit
"don't list a name" which is the only route back to a nameless row.
`settings.effectiveName` collapses them into the single string a record carries,
and is the only one of the four values `buildRunRecord` should ever see.

**Two constraints this had to respect, both older than it.**

- *Nothing is derived from the Google profile.* Still true: a name is typed or
  randomly assigned, never read from the account.
- *A run must never be lost.* `/api/runs` is `on conflict (run_key) do nothing`
  so a replayed offline backlog cannot rewrite stored history. Renaming a run
  that is already written therefore needs its own path, which is `/api/claim` —
  it changes `playerName` on one row and nothing else.

**How `/api/claim` decides who may rename a run.** A signed-in run needs a
session whose `sub` matches the row, as every write has since issue 07. A guest
has no session and every guest is `'guest'`, so the proof is the run key itself:
`guest:<startedAt>:<runSeed>`, where `runSeed` is minted at run start and lives
only in that player's record. Legacy guest runs predate `runSeed` and key on the
timestamp alone, which is guessable, so **they are refused** rather than left
open to anyone iterating milliseconds.

**Not verified in production**, like the rest of issue 08's surface: there is no
`/api` in `vite dev`, so `/api/claim` has never run against a real database. Add
it to issue 13's checklist — a claim that 404s would leave the run under its old
name silently.

## Names identify a label; devices identify a player

Added 2026-08-30, straight after assigned names. It closes a defect the assigned
names made visible rather than one they introduced.

**The defect.** `api/leaderboard.js` grouped guests by their *name*, because
every guest posts as `account_id 'guest'` and there was nothing else to group
on. That made name equality mean person equality: two guests sharing a name
landed in one partition, and since the dedupe runs *inside* the ranking
subquery, the slower one was removed from the ranked population entirely — not
ranked lower, absent. It also applied to typed names, so two players who both
chose "Rookwarden" hit it just as hard as two who were assigned the same name.

**The fix, in two parts.** Both came out of looking at how others solve this:
Discord's Pomelo move separated a unique identity from a non-unique display
name, and Unity's anonymous sign-in and Player Network's GuestID both mint a
device-side id precisely so an unregistered player has a stable identity.

- *Identity.* Records carry `deviceId` (record v8), and the guest branch of the
  partition groups on it. Names became free to collide without costing anyone a
  row. Old runs have no `deviceId` and fall back to grouping by name, so no
  stored row changed behaviour on deploy.
- *Uniqueness.* `api/_lib/handles.js` makes the name itself unique anyway —
  first owner to post under it keeps it, later ones are disambiguated. A name
  ending in a number counts up (`Ashen Vagrant 47` → `48`) rather than being
  suffixed, which keeps assigned names in register.

**Why uniqueness is settled on the server and not while the player types.**
Sigil is offline-first: runs queue locally, an unreachable `/api/runs` is an
expected state, and nothing in the client may block on the network. A
reservation flow would make naming a network operation, and would need a round
trip on first launch just to hand a new player their assigned name. So naming
stays local and instant, and the server settles the string on the way in,
reporting back what it actually stored. That trade is only sound because a name
here is a label on a leaderboard row. **If names ever become addresses** — used
to find, invite, or link to a player — this should become a real reservation
flow instead.

**A claim is never released.** A record stores the name it was posted under, so
freeing a name would let a second owner take it while the first owner's older
rows still carry it, reproducing the duplicate the table exists to prevent.
Keeping every claim makes the invariant hold with no work from the board: a
given string belongs to exactly one owner, always. Squatting is the accepted
cost at this scale.

**A side benefit worth knowing.** The board marks your own row `you: true`, and
that only ever worked for signed-in players — the code explicitly skipped it for
guests, since `'guest'` identifies no one. A guest can now send `device=` and get
their own row marked, which is exactly what is needed on the rare board showing
two rows with the same name.

**Not verified in production.** Same caveat as everything else on this seam:
there is no `/api` in `vite dev`, so neither the partition change nor the
`handles` table has run against a real database. Issue 13 carries the checks.

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
item there is not optional:

- **Confirm signed-in players are not being 401'd** by the hardened write
  endpoints. That is the one regression that would silently stop recording every
  signed-in run.

The privacy contact mailbox (`src/privacyContact.js`) was the other one, and it
is done: `privacy@sigildeck.com` was verified end to end on 2026-08-06, with a
message sent from an outside account and a reply received.

Issue 02 left one gap, tracked as **issue 27** and now closed: a run that gets
*stuck* without throwing is discarded from Settings, which the home menu reaches
on a phone as well as a desktop.

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
| [08](08-moderation-tools.md) | No moderation path for handles, rows, or feedback | security | M | **done** |
| [09](09-merge-runseed-dedupe-bug.md) | **BUG** `merge.js` omits `runSeed`, dropping runs on sync | bug | S | **done** |
| [10](10-stale-db-schema.md) | `db/schema.sql` no longer describes the database | docs | S | **done** |
| [26](26-dead-mobile-responsive-spec.md) | **BUG** all 25 tests in `mobile-responsive.spec.js` were dead | testing | M | **done** |
| [28](28-bare-hands-covers-weapon-preview.md) | **BUG** bare-hands button covers the weapon preview | bug | S | **done** |
| [29](29-forge-stops-at-seven-sigils.md) | **BUG** the Forge stops opening at sigil 7; the run needs 10 | bug | S | **done** |
| [30](30-leaderboard-name-not-synced.md) | **BUG** a signed-in player gets a different name on every device | bug | M | open |
| [31](31-profile-merge-drops-unknown-fields.md) | The profile merge silently drops fields it does not know | bug | S | open |

### P2 — product decisions

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [11](11-feature-flag-defaults.md) | Decide feature flag defaults (6 of 7 off) | product | S | open |
| [12](12-unreachable-glossary-and-card-library.md) | Card library + Boons/Trials glossary unreachable | product | S | open |
| [13](13-verify-admin-stats-in-prod.md) | Verify `/api/stats` + `/admin` in prod before inviting anyone | product | S | open |
| [14](14-anonymous-handle-copy-mismatch.md) | **BUG** UI promises "Anonymous" listing; server excludes it | bug | S | **done** |
| [27](27-save-reset-outside-crash-path.md) | No save reset for a run stuck without crashing | product | S | **done** |
| [34](34-analytics-funnel-gaps.md) | The funnel cannot see the tutorial, where batch 1 starts | product | M | open |

### P3 — quality, performance, accessibility

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [15](15-unit-tests-game-logic.md) | No unit tests over ~100KB of game logic | testing | L | **done** |
| [16](16-audio-payload.md) | ~31MB audio, ~17MB byte-identical duplicates | performance | S | **done** |
| [17](17-prefers-reduced-motion.md) | No `prefers-reduced-motion`; 4 infinite animations | accessibility | S | open |
| [18](18-google-fonts-blocking-import.md) | Render-blocking Google Fonts `@import` | performance | S | open |
| [19](19-robots-txt.md) | No `robots.txt` while `/admin` is live | hygiene | S | **done** |
| [32](32-music-bed-payload.md) | Two music beds are 15MB of the 16MB audio payload | performance | M | open |
| [33](33-untested-api-handlers.md) | Five API handlers untested, including the one that can lose a save | testing | L | **done** |
| [35](35-no-service-worker.md) | No service worker: manifest-only PWA, no offline play | performance | M | open |
| [37](37-no-balance-simulator.md) | Nothing can measure the winrate targets the design doc sets | testing | L | open |

### P4 — hygiene and doc accuracy

| # | Issue | Area | Effort | Status |
|---|---|---|---|---|
| [20](20-readme-license-env-example.md) | No README, LICENSE, or `.env.example` | docs | M | **done** |
| [21](21-gitignore-env.md) | `.gitignore` misses `.env` while docs point at it | security | S | **done** |
| [22](22-archive-session-docs.md) | Nine session-artifact docs in the repo root | hygiene | S | **done** |
| [23](23-stale-design-md.md) | `DESIGN.md` contradicts the shipped game | docs | M | **done** |
| [24](24-duplicate-ci-workflows.md) | Mobile tests run twice per push | ci | S | **done** |
| [25](25-rules-copy-review.md) | Review rules copy against the post-rework game | docs | S | **done** |
| [36](36-doc-drift-schema-and-backlog.md) | `schema.sql` miscounts its tables; README lists a done item as open | docs | S | **done** |

## Pick order

Seven issues are open. This section is the ordering rule — it beats any
largest-effort-first default, including an unattended run's.

**Do these before strangers arrive, in this order:**

1. **13** — the production verification pass. **Needs a person** (see below).
2. **11** then **12** — the flag defaults and the reference UI they gate.
   **11 needs a person**; 12 follows from it.
3. **31** then **30** — the profile-shape guard, then the name-sync bug it
   protects. In that order: 31 is the test that keeps 30 fixed.

Issue 29 (the Forge cadence) closed on 2026-09-02 and unblocks 34 and 37.

**Then, in any order:** 37 (the balance simulator), 34
(analytics funnel), 32 (audio payload), 17 (reduced motion), 18 (fonts), 35
(service worker — after 18 and 32).

### Needs a person, not an agent

Three open items cannot be worked unattended, and an agent should skip them
rather than approximate them:

- **13** — verification against the real deployment. Needs Vercel env access and
  a live database; there is no `/api` in `vite dev`.
- **11** — a product decision about what a live game shows its players. The
  issue lays out the trade; the answer is Joey's.
- **The distribution hand-offs** — `docs/reddit/POSTS.md` (playtest posts, and
  its own pre-post checklist) and `docs/itch/PAGE.md` (the itch.io page). Both
  need his accounts on outside services. They are not backlog issues and are not
  meant to become any.

### The standing pick for a long unattended window

**37** (the balance simulator, effort L). Issue 33 held this slot and closed on
2026-09-02; every API handler now has tests.

**37 is interruption-safe the same way 33 was** — the run loop,
then the random policy, then the greedy one, then the report, then the baseline,
each worth having alone. It stays second because 33 guards a player's saved
progress and 37 guards a number. **Whether 37 should take this slot before batch
1 is Joey's call, not an agent's** — the case for promoting it is that balance is
what batch 1 actually experiences, and the measurement is worth much less after
they have played.

Issue 15 held this slot until it closed on 2026-08-30. Do not pick it again.

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

08 (moderation) ───> 13 (verify the endpoints against production)

31 (shape guard) ──> 30 (name sync: the guard is what keeps it fixed)
30 (name sync) ────> 13 (adds a cross-device check to the prod pass)
18 (local fonts) ──> 35 (nothing to precache while the fonts are third-party)
32 (audio size) ───> 35 (decides what a service worker must not precache)
35 (service worker) ──> 13 (a stale-shell bug cannot be fixed by deploying)
29 (forge cadence) ──> 34 (settle how many Forge visits a run has before
                          instrumenting the choices made in them)
29 (forge cadence) ──> 37 (fix the cadence first; the sim's Forge-visit check
                          is what keeps it fixed)
37 (simulator) ──────> 34 (the sim measures the designed curve, telemetry the
                          real one -- same shape, so build the report once)

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
