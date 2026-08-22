# Sigil

A roguelike deckbuilder of one bad night. Forge your kit, descend blind, and earn
ten sigils to escape.

**Play it: [sigildeck.com](https://sigildeck.com)**

![Sigil](public/og-image.png)

Sigil began as an implementation of the 2011 single-deck card game *Scoundrel*
by Zach Gage and Kurt Bieg, and has diverged substantially since. You no longer
edit one 44-card deck: you own a **kit** of weapons, potions and tools, and the
dungeon rolls its own monster pool for each descent, merged and shuffled with
your kit at the moment you go down. You descend without seeing what is coming.

> **Naming note.** The project was renamed from *Scoundrel* to *Sigil*, but the
> rename touched user-facing surface only. The `src/games/scoundrel/` module
> path, the `scoundrel:` localStorage prefix, and the working directory
> `apps/scoundrel` are all deliberately unchanged — renaming them would orphan
> every existing player's save for no visible gain. Expect to see both names.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That is genuinely all of it. **No environment variables are required to play or
to work on the rules engine** — with nothing configured, the game runs
local-only: saves live in `localStorage`, there is no sign-in, no leaderboard and
no analytics. Configure the environment only when you need the server half.

One caveat that has cost time before: **`vite dev` and `vite preview` do not
serve `/api`.** Those are Vercel serverless functions. Anything touching auth,
runs, the leaderboard or `/admin` cannot be exercised locally against a plain
Vite server — which is why issue 13 exists as a production checklist.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built `dist/` on :4173 |
| `npm run lint` | ESLint over the repo |
| `npm run icons` | Regenerate favicons/PWA icons from the source mark |
| `npm test` | Everything: vitest, then Playwright |
| `npm run test:unit` | Vitest only — sub-second, the gate to run constantly |
| `npm run test:unit:watch` | Vitest in watch mode |
| `npm run test:e2e` | All Playwright projects |
| `npm run test:dev` | Playwright against the dev server |
| `npm run test:prod` | Playwright against `vite preview` (production build) |
| `npm run test:mobile` | The quick mobile-responsive spec |
| `npm run test:mobile:full` | The full mobile-responsive spec |
| `npm run test:mobile:ui` / `:headed` | The same, with Playwright's UI / a visible browser |

Before calling anything done: `npm run lint && npm run build && npm test`.

### Testing convention

**The test lands in the same change as the fix**, not as a follow-up. If the
harness cannot reach the behavior, extending the harness is part of that work.

Pick the cheapest runner that can actually assert the thing — vitest (`test/`)
for pure logic and for the serverless handlers, which are testable by stubbing
the Neon client; Playwright `dev` for UI; Playwright `prod` (named
`*.prod.spec.js`) for anything that only holds in a production build, such as
code gated on `import.meta.env.DEV`.

Shared fixtures — a seeded rng and the state factories — live in
`test/support/state.js`. Start there rather than hand-rolling a state literal.

Two traps have already produced tests that passed for the wrong reason:

- `page.goto` resolves on `load`, but the game sits behind a lazy import. Wait
  for a real element before asserting on anything the app writes.
- `addInitScript` re-runs on **every** navigation, so any key a test mutates must
  be set with `page.evaluate` after the first load — otherwise a reload
  resurrects the original value.

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. `.env`, `.env.*`
and `.env.local` are all gitignored; only `.env.example` is tracked.

`VITE_*` variables are **build-time** — Vite inlines them into the client
bundle, so they are public and must never hold a secret. The rest are
**runtime**, read by the functions in `api/`, and belong in the Vercel project.

| Variable | Time | Used by | If missing |
|---|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | build | `src/utils/auth.js`, `LoginModal.jsx` | ⚠ **Silently falls back to a local "dev sign-in" form** |
| `VITE_PUBLIC_POSTHOG_TOKEN` | build | `src/main.jsx` | No product analytics |
| `VITE_PUBLIC_POSTHOG_HOST` | build | `src/main.jsx` | No product analytics |
| `GOOGLE_CLIENT_ID` | runtime | `api/_lib/google.js`, `api/auth.js` | `/api/auth` returns 503 |
| `SESSION_SECRET` | runtime | `api/_lib/session.js`, `api/auth.js` | `/api/auth` returns 503 |
| `DATABASE_URL` | runtime | every `api/*` endpoint | Every endpoint 503s |
| `ADMIN_TOKEN` | runtime | `api/stats.js`, `api/cron-backfill-runs.js` | `/admin` unusable |
| `CRON_SECRET` | runtime | `api/cron-backfill-runs.js` | Weekly backfill unauthorized |

**`VITE_GOOGLE_CLIENT_ID` is the one to watch.** Its absence does not error — it
quietly swaps real Google auth for a local sign-in form that trusts whatever name
you type. A production build missing it ships that form to real users. Verify it
is set before every deploy.

`GOOGLE_CLIENT_ID` must hold the *same* value as `VITE_GOOGLE_CLIENT_ID`; the
server verifies the ID token the client obtained, so a mismatch fails every
sign-in.

## Architecture

**React 19 + Vite + Tailwind 4** on the client, **Vercel serverless functions**
in `api/`, **Neon Postgres** behind them.

### localStorage is the source of truth

The game is fully playable offline and signed out. Everything a player has —
the in-progress run, history, unlocks, settings — lives under a `scoundrel:`
prefix in `localStorage`:

| Key | Holds |
|---|---|
| `scoundrel:save` | The in-progress run |
| `scoundrel:boonLibrary` | Unlocked boons |
| `scoundrel:seenSpecials` | Specials encountered |
| `scoundrel:ascensionUnlocked` | Ladder progress |
| `scoundrel:tutorialCompleted` | Tutorial flag |
| `scoundrel:leaderboardHandle` | Public handle |
| `scoundrel:flags` | Feature flags |
| `scoundrel:user` / `scoundrel:session` | Signed-in identity and session token |
| `scoundrel:devTools` | Dev panel gate (issue 01) |
| `scoundrel:cardLayout`, `:muted`, `:musicVolume`, `:sfxVolume` | Preferences |

The server is a **convergent replica**, not the authority. `api/_lib/merge.js`
folds an incoming snapshot into whatever the server holds and returns the union,
so cross-device sync and the guest-to-account fold are the same operation, and
two devices syncing in either order reach the same result:

- `library` / `seenSpecials` — set union; unlocks only ever accumulate
- `ascensionUnlocked` — max; the ladder never walks backward
- `tutorialCompleted` — logical OR; once done, always done
- `history` — union keyed by run, newest kept, capped at 200

The one field that cannot merge is the in-progress run, since it is a single
evolving object: that is last-write-wins by `savedAt`. A device with no local run
sends `save: null` and never clobbers.

The practical consequence: a player can lose an in-progress run to a newer device
but can never lose an unlock.

### Module layout

```
src/
  games/scoundrel/
    logic/          the rules engine, the part with real unit coverage
      combat.js       resolving a fight
      deck.js         building the descent deck from kit + rolled pool
      lifecycle.js    run start/end, descent transitions
      sanctuary.js    between-descent economy
      helpers.js
    constants.js    SIGIL_TARGET, suits, MODES, VERSION_HISTORY
    flags.js        feature flags
    themes.js  boons.js  bosses.js  afflictions.js  ascensions.js
    history.js  settings.js  audio.js  analytics.js
    components/     the UI
  admin/            the /admin dashboard
  utils/            auth, storage, sync
api/
  auth.js  runs.js  save.js  leaderboard.js  feedback.js  stats.js
  cron-backfill-runs.js
  _lib/  google.js  session.js  merge.js  validate.js  rateLimit.js  runsTable.js
```

### Feature flags

Per-device toggles in `src/games/scoundrel/flags.js`, persisted to
`scoundrel:flags`. Six of the seven ship off; `customCards` is the exception.

**URL params take precedence over stored values**, so a link reproduces a
specific configuration: `?flag-wounds=0`, `?flag-bosses=1`. That is the intended
way to hand someone a repro.

To add one: add it to `DEFAULTS`, add a matching `FLAG_META` entry for the dev
panel, and guard the feature with `isEnabled('your-flag')`.

### Balance versions

`VERSION_HISTORY` in `constants.js` is an append-only, oldest-first list of
balance versions; `GAME_VERSION` is always its last entry, stamped onto every
finished run. Append a new entry by hand whenever a gameplay change makes prior
runs' stats incomparable — a reworked boon, a retuned theme, a damage formula
change. **Never reorder or remove an entry:** that array *is* the sort order the
`/admin` range filter uses, because free-form labels do not sort reliably on
their own (`0.10` sorts before `0.9` lexicographically).

Current version is `0.4`.

## Deployment

Vercel, from `main`. `vercel.json` carries three things:

- a **SPA rewrite** sending everything except `/api/*` to `index.html`, so client
  routes survive a hard refresh
- **`dawn/*` deployments disabled**, so unattended branches never build
- a **weekly cron**, `/api/cron-backfill-runs` at 04:00 Mondays, guarded by
  `CRON_SECRET`

`db/schema.sql` describes the Neon schema — with the caveat that it has drifted
from the live database (issue 10).

There is also an itch.io standalone build. Neither deploy path should ever be run
unattended.

## Documentation map

| File | What it is |
|---|---|
| `REWORK.md` | **The design of record.** Start here for how the game actually works. |
| `DESIGN.md` | ⚠ **Stale** — describes the pre-rework game and contradicts the shipped one on core mechanics (issue 23). Do not trust it until that lands. |
| `WINRATE_TARGETS.md` | Balance targets |
| `docs/RESPONSIVE_AND_PWA_PLAN.md` | The spec behind issue 04 |
| `docs/EXTENSIONS.md`, `docs/Storyline.md`, `docs/MOBILE_UI_IMPROVEMENTS.md` | Design notes |
| `docs/archive/` | Historical session notes. Not current documentation — see its [README](docs/archive/README.md). |
| `docs/issues/` | The launch-readiness backlog — statuses and a dependency graph in its [README](docs/issues/README.md) |
| `db/schema.sql` | Database schema (drifted — issue 10) |
| `public/audio/music/CREDITS.md` | Music attribution, required by CC BY |

## Contributing

Work an issue from `docs/issues/` — each file is self-contained, with evidence at
`file:line` and its own acceptance criteria, so you should not need to re-derive
the audit. Set `status: in-progress` when you pick one up and `status: done` when
every criterion is genuinely met.

Read the linked files before changing them. Several issues note that the *code*
is right and the *docs* are wrong; don't "fix" correct code to match a stale spec.

## License

[MIT](LICENSE) for the source code.

The bundled music is by Kevin MacLeod under **CC BY 3.0**, which requires
attribution — see [`LICENSE`](LICENSE) and
[`public/audio/music/CREDITS.md`](public/audio/music/CREDITS.md) before reusing
or redistributing it.
