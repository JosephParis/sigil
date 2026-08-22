---
id: 20
title: "No README, LICENSE, or .env.example"
priority: P4
area: docs
effort: M
status: done
---

## Problem

The repo root has 14 markdown files and none of them is a README. There is also
no LICENSE and no `.env.example`.

The practical consequence: setting up a fresh machine — or onboarding anyone,
human or agent — requires reading source comments to discover the environment
variables. There are eight, spread across client and server:

| Variable | Used by | Effect if missing |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `src/utils/auth.js`, `LoginModal.jsx` | **Silently falls back to a local "dev sign-in" form** |
| `GOOGLE_CLIENT_ID` | `api/_lib/google.js`, `api/auth.js` | `/api/auth` returns 503 |
| `SESSION_SECRET` | `api/_lib/session.js`, `api/auth.js` | `/api/auth` returns 503 |
| `DATABASE_URL` | all `api/*` endpoints | every endpoint 503s |
| `ADMIN_TOKEN` | `api/stats.js`, `api/cron-backfill-runs.js` | `/admin` unusable |
| `CRON_SECRET` | `api/cron-backfill-runs.js` | weekly backfill unauthorized |
| `VITE_PUBLIC_POSTHOG_TOKEN` | `src/main.jsx` | no product analytics |
| `VITE_PUBLIC_POSTHOG_HOST` | `src/main.jsx` | no product analytics |

The `VITE_GOOGLE_CLIENT_ID` row is the dangerous one — its absence doesn't error,
it quietly swaps real auth for a fake local sign-in. A production build missing
that variable ships a login form that trusts whatever name you type.

## Suggested fix

**`README.md`** — what the game is, one screenshot, then:

- Quick start: `npm i`, `npm run dev`
- Every script: `dev`, `build`, `lint`, `preview`, `test`, `test:mobile`
- The full env var table above, marking which are build-time (`VITE_*`) vs runtime
- Architecture in a few paragraphs: localStorage as source of truth with
  convergent server-side merge; `logic/` module split; the feature flag system
  and its `?flag-<id>=1` override; `GAME_VERSION` balance stamping
- Pointers to the other docs: `REWORK.md` as the design of record, `DESIGN.md`
  (with a staleness warning until issue 23 lands), `WINRATE_TARGETS.md`,
  `db/schema.sql`, and `docs/issues/` for this backlog
- Deployment notes: Vercel, the SPA rewrite, the weekly cron

**`.env.example`** — all eight variables with placeholder values and a comment
each. Explicitly warn that a production build without `VITE_GOOGLE_CLIENT_ID`
falls back to dev sign-in.

**`LICENSE`** — pick one. This matters more than it looks: without a license the
default is "all rights reserved," so nobody can legally fork or contribute, and
it's ambiguous what batch-1 users may do with the code if the repo is public.
Note the audio is CC BY 3.0 (see `public/audio/music/CREDITS.md`) and the fonts
are OFL if issue 18 self-hosts them — so a note on third-party asset licensing
belongs here too.

## Acceptance criteria

- [x] `README.md` covers setup, scripts, all eight env vars, architecture, deployment
- [x] `.env.example` lists all eight with the dev-sign-in warning called out
- [x] `LICENSE` chosen and added, with third-party asset licenses noted
- [x] A clean clone can be brought up from the README alone

## Resolution

Landed on `dawn/2026-08-22`, after issue 21 (which had to go first, so
`.env.example` would stay trackable under the broadened ignore rules).

**`README.md`** — what the game is, the og-image as the screenshot, quick start,
the full script table, the testing convention and its two Playwright traps, the
eight env vars split build-time vs runtime, architecture (localStorage as source
of truth with the convergent merge, module layout, feature flags and their
`?flag-<id>=1` override, `VERSION_HISTORY` / `GAME_VERSION`), deployment, and a
documentation map that carries the staleness warning on `DESIGN.md` until issue
23 lands.

Two things the audit did not list, both worth a reader's time:

- **The game needs no environment variables at all to run.** A clean clone is
  `npm install && npm run dev`; with nothing configured it plays local-only. The
  env table reads as a prerequisite list otherwise, and it is not one.
- **`vite dev` and `vite preview` do not serve `/api`.** That is the fact behind
  issue 13 existing as a production checklist, and it is not obvious from the
  tree.

**`.env.example`** — all eight, grouped build-time vs runtime, with the
dev-sign-in warning called out twice (on the variable and in the header). Also
records that `GOOGLE_CLIENT_ID` must match `VITE_GOOGLE_CLIENT_ID`, since a
mismatch fails every sign-in, and that rotating `SESSION_SECRET` forces a
re-sign-in without losing data.

**`LICENSE`** — **MIT**, with a third-party asset section covering the CC BY 3.0
music (attribution is a redistribution obligation, not a nicety), the
public-domain bell cues, a placeholder for OFL fonts if issue 18 self-hosts them,
and a note on the debt to Gage and Bieg's original *Scoundrel*.

### Decision to revisit: MIT

MIT was chosen as the default for a public repo whose value is the game rather
than the code, and it is the least friction for anyone reading the source. It is
worth an explicit second look, because it is the one decision here that is hard
to walk back: it permits commercial redistribution of the game's code. If that is
not wanted, the alternatives are a source-available license, or MIT on the code
with assets and content reserved. Nothing else in this issue is contentious.
