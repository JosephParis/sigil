---
id: 13
title: "Verify /api/stats and /admin work against production before inviting anyone"
priority: P2
area: product
effort: S
status: open
---

## Problem

Balance has never been measured against real players, and the pipeline that would
measure it has never been exercised end to end in production.

`WINRATE_TARGETS.md` sets the targets: **~20% total winrate (15–25% acceptable
band)**, per-tier survival bands, and a go point of **~1,500–2,000 default-mode
A0 runs** before acting on theme bands. Batch 1 is the only way to get those
runs.

## Why this is urgent rather than routine

If `/api/stats` or `/admin` is broken in production, you find out *after* the
cohort has played. The runs are recorded either way (`api/runs.js` writes
independently of the dashboard), but you'd be flying blind during the window when
you most want to react — and any misconfiguration that affects *writes* rather
than reads loses the data permanently.

Checking takes minutes now and is unrecoverable later.

## Pre-launch checklist

Environment, in Vercel:

- [ ] `DATABASE_URL` set and reachable (all endpoints 503 without it)
- [ ] `ADMIN_TOKEN` set — `api/stats.js` requires it as a bearer token
- [ ] `CRON_SECRET` set — `api/cron-backfill-runs.js` accepts either this or `ADMIN_TOKEN`
- [ ] `GOOGLE_CLIENT_ID` + `SESSION_SECRET` set (`api/auth.js` 503s without both)
- [x] `VITE_GOOGLE_CLIENT_ID` set at build time — without it `LoginModal` silently falls back to the local "dev sign-in" form, which must **not** happen in production. **Verified 2026-08-22** against the deploy of `2cfeb5e`: a real `...apps.googleusercontent.com` id is present in the lazy-loaded `scoundrel-*` chunk (grepping `index-*.js` alone reports a false negative — `LoginModal` is not in the entry bundle)
- [x] `VITE_PUBLIC_POSTHOG_TOKEN` + `VITE_PUBLIC_POSTHOG_HOST` set — was **absent until 2026-08-27**, so production recorded zero events from launch until then. Set in Vercel and **verified live** on the deploy of `c63bea9`: events and session recordings ingest with HTTP 200. See below, including the bot-detection trap that makes this easy to mis-verify.

End-to-end, against the deployed URL:

- [ ] Play one real run to completion. Confirm it appears in `runs`.
- [ ] `/admin` accepts `ADMIN_TOKEN` via `TokenGate` and renders. All 19
      aggregations in `api/stats.js` return without error on a near-empty
      dataset — several are prone to divide-by-zero or null-band edge cases when
      `n` is tiny, and that is exactly the state on day one.
- [ ] `VersionRange` From/To picker filters correctly across `VERSION_HISTORY`
- [ ] Band verdicts render (`src/admin/bands.js` against `WINRATE_TARGETS.md`)
- [ ] Submit feedback from the live site; confirm it appears in the admin feedback view
- [ ] Play one run with Dev tools; confirm it is `dev: true` and **excluded** from stats
- [ ] Win a run without ever opening Settings. Confirm it appears on the
      leaderboard under the **assigned** name (e.g. `Ashen Vagrant 47`), not as
      "Anonymous" and not missing. This is the default path every player takes,
      and it has never run against a real database.
- [ ] Set your own handle, win a run, confirm the board credits that instead
- [ ] Tick "don't list a name" in Settings, win a run, confirm the row appears
      and reads Anonymous — the run is listed either way (issue 14, twice
      superseded; read its file before assuming what the rule is)
- [ ] **`/api/claim`:** win a run, then rename yourself from the victory screen.
      Confirm the board row that was already written changes name. A 404 here
      leaves the run under its old name silently, which is the failure mode
      nobody reports.
- [ ] Rename as a **guest** as well as signed in — the two take different
      authorisation paths (session vs. the run key's `runSeed`)
- [ ] Win a run on a second device and confirm the two guests get **separate
      rows**. They are now told apart by `deviceId`, not by name, so force the
      hard case: set the *same* name on both devices and confirm both still
      place. That is the defect this replaced, and it is invisible until two
      real devices post.
- [ ] Confirm the `handles` table is created on first write and that a second
      owner claiming a taken name is stored disambiguated (`Rookwarden 2`), with
      the response reporting the stored name rather than the requested one
- [ ] Confirm an assigned name counts up rather than being suffixed: a second
      device asking for `Ashen Vagrant 47` should land on `Ashen Vagrant 48`
- [ ] Open the board signed out and confirm **your own row reads "You"**. Guest
      self-marking is new (`device=` query param); it never worked before, and
      it is what makes two same-named rows survivable
- [ ] Confirm no `deviceId` or `account_id` appears anywhere in the
      `/api/leaderboard` response body
- [ ] Confirm the weekly cron (`0 4 * * 1` → `/api/cron-backfill-runs`) is
      registered in Vercel and returns 200 when triggered manually
- [ ] Sign in on a second device; confirm history merges both ways (and see issue 09)

Carried over from issue 04 (markup and assets are tested, but no scraper or real
device was involved):

- [ ] Paste the deployed URL into Discord/Slack and confirm the card shows title,
      description and image
- [x] Confirm `VERCEL_PROJECT_PRODUCTION_URL` resolved, i.e. `og:image` in the
      deployed HTML is **absolute** rather than `/og-image.png` — it reads
      `https://sigildeck.com/og-image.png`, so `VITE_SITE_URL` is **not needed**;
      the Vercel-provided variable already resolves to the custom apex
- [ ] Mobile Chrome offers "Add to Home screen", and the installed icon is the
      maskable one rather than a cropped square
- [ ] Run Lighthouse and confirm the PWA installability checks pass

Carried over from issue 06:

- [x] **Create the privacy contact mailbox** and send it a test message — done
      2026-08-06. `PRIVACY_CONTACT` is now `privacy@sigildeck.com`, forwarded by
      Cloudflare Email Routing, with Gmail configured to reply *as* that address
      (`smtp.gmail.com` submission on 587 with an App Password) so answering a
      request never discloses the personal inbox. Round-tripped from an outside
      account: message received, reply sent and received under the right sender.
- [x] Confirm `/privacy` resolves on the deployment as a direct URL (it relies on
      the `vercel.json` SPA rewrite, not just client-side routing) — 200 on
      `https://sigildeck.com/privacy`
- [ ] Confirm PostHog person profiles show a pseudonym and **no** email or name

Carried over from issue 07, which hardened the write endpoints but could not test
them against a deployment (there is no `/api` in `vite dev` or `vite preview`):

Auth wiring confirmed on the deployment 2026-08-06, both halves:

- [x] Client build carries `VITE_GOOGLE_CLIENT_ID` — it is in the `scoundrel-*`
      chunk, **not** the entry bundle, because that is where `LoginModal` lands.
      Grepping `index-*.js` alone reports a false negative; don't repeat that.
- [x] Server has `GOOGLE_CLIENT_ID` and `SESSION_SECRET` — `POST /api/auth` with
      an empty body returns `400 missing_credential`. `api/auth.js:21` returns
      `503 auth_not_configured` if either is missing, so reaching the 400 branch
      proves both are set.
- [x] `/api/stats` returns 401 unauthenticated

- [ ] A **signed-in** player's run reaches `runs` — i.e. `historyStore` is sending
      `Authorization` and is not being 401'd. This is the regression to watch: a
      broken token path would silently stop recording every signed-in run.
      **Only a real signed-in run can check this.** A synthetic probe cannot:
      `runs.js` validates the batch (`:74`) *before* the auth gate (`:84`), so a
      throwaway record is rejected with `400 no_valid_records` and never reaches
      `mayWriteAs` — and a record valid enough to reach it would write a junk row
      to the production table if the gate were broken. `mayWriteAs` itself has 7
      unit tests; what is untested is only the deployed wiring.
- [ ] A **guest** run still reaches `runs` with no token
- [ ] Signed-in and guest feedback both still submit
- [ ] A hand-rolled POST to `/api/runs` claiming someone else's `accountId` is
      rejected with 401
- [ ] Hammering `/api/runs` past 30/min returns 429 with `Retry-After`
- [ ] **Moderation (issue 08) end to end.** None of this can run locally — there
      is no `/api` in `vite dev` or `vite preview`, so the panel has never made a
      real request:
  - [ ] `/api/moderation` returns 401 without the token and 401 with a wrong one
  - [ ] The Moderation panel on `/admin` opens and lists published handles
  - [ ] Block a test account; confirm its rows leave the public board and that
        the ranking has no gap where they were
  - [ ] Unblock it; confirm the rows come back and the save was untouched
  - [ ] Delete one run row; confirm it is gone from the board and from `runs`
  - [ ] Delete one feedback note from the admin feedback view
  - [ ] Confirm `blocked_accounts` was created on the first call rather than
        500ing on a missing relation
  - [ ] Post a run with a screened handle by hand; confirm it is stored with a
        null `playerName` and does not appear on the board
- [ ] The `rate_limits` table was created on first use and is being swept
- [ ] The leaderboard still lists real victories after the 60s floor and the
      rooms/sigil cross-checks — confirm a genuine win is not filtered out

## PostHog: unconfigured since launch, fixed and verified 2026-08-27

Checked against the deploy of `b4a2f17`. The instrumentation in the tree is
complete and needs no work: `main.jsx` defers the SDK past `window.load`,
`useRunAnalytics` emits `run_started` / `descent_started` / `run_ended` /
`run_abandoned` with edge-detection and a pre-init buffer, `identify` sends only
the opaque Google `sub` plus a derived pseudonym (issue 06), and `ErrorBoundary`
reports crashes. None of it can fire, because the token is missing.

Three independent checks, all negative:

- **No `phc_` token in any served chunk.** Grepped every asset the deployment
  serves, not just the entry bundle — `index-*`, `posthog-*`, `rolldown-runtime-*`
  — after the false-negative lesson recorded above for `VITE_GOOGLE_CLIENT_ID`.
  Note the lazy chunk hashes in a local `dist/` do **not** match production, so
  probing prod for a locally-built filename returns the SPA rewrite (HTTP 200,
  `text/html`, ~3KB) rather than a 404. Check `content_type`, not status.
- **No ingest host in the bundle.** `us.i.posthog.com` appears only inside the
  vendored `posthog-*` chunk's own source, never in the entry bundle where
  `POSTHOG_HOST` would be inlined — the init block is unreachable and folds away.
- **Zero ingest requests at runtime.** Loaded `https://sigildeck.com/` in
  headless Chromium, waited 9s past `load` (well past the `requestIdleCallback`
  deadline of 5s): the only PostHog-matching request is the chunk fetch itself,
  and `window.posthog` is `undefined`.

The failure is silent by design — `main.jsx:45` returns early on a missing token
so a clean clone runs with no analytics. That is right for local dev and wrong
for production, where it means the launch cohort's runs are being measured only
by the `runs` table, with no funnel, no drop-off and no `run_abandoned` signal.

### Resolved the same day

Joey created the project and set both variables in Vercel. Note Vercel's env-var
UI warns that a `VITE_`-prefixed value is exposed to the browser and offers to
strip the prefix — **do not**. A PostHog project key (`phc_…`) is a write-only
ingest key and is meant to be public, and `main.jsx:35` reads it through
`import.meta.env`, which only exposes `VITE_*`. Removing the prefix reproduces
exactly the silent failure above. Choose "Config".

`VITE_*` values are inlined at build time, so setting them changes nothing until
a rebuild. This docs commit was the redeploy trigger.

Verified on the deploy of `c63bea9`: the token is in the entry bundle,
`api_host` resolves to `https://us.i.posthog.com`, and a real browser session
POSTs to `/e/`, `/i/v0/e/` and `/s/` — nine requests, all 200 — across a page
load and a started descent. Session recording is on.

### The trap: posthog-js silently drops bot traffic

**Analytics cannot be verified from a headless browser.** posthog-js runs its
full init against a bot UA — remote config fetched, extensions loaded, session
id generated, debug log clean — and then makes `capture()` a no-op. There is no
warning. It looks exactly like a broken deployment.

Two independent signals trigger it, and defeating one is not enough:

- `headlesschrome` is in the SDK's default blocked-user-agent list
- the check ends on `navigator.webdriver`, which Playwright always sets, so an
  overridden UA alone still yields zero events

Verifying this again means `chromium.launch({ headless: false })` plus an init
script setting `navigator.webdriver` to false. The **bundle** check is the one
that works headlessly: grep the served entry chunk for `phc_`, which no bot
filter can affect.

A few test events and one session recording from this verification are in the
project, dated 2026-08-27.

## Measurement plan

- [ ] Record the `GAME_VERSION` the window opens on, and freeze balance-affecting changes for its duration
- [ ] Settle issue 11's flag defaults **before** the window opens
- [ ] Note that ~1,500–2,000 runs is a lot for one small batch — decide up front whether batch 1 is a *qualitative* pass (bugs, comprehension, feel) with balance deferred to a larger batch 2. Sizing the cohort against the go point tells you which one you're running.

## Acceptance criteria

- [ ] Every checklist item above verified against production, not preview
- [ ] A screenshot or note recording that `/admin` rendered correctly with real data
- [ ] Explicit decision on whether batch 1 is qualitative or a balance measurement

## Verified against production, 2026-08-22 (deploy of `2cfeb5e`)

Checked by fetching the live deployment. These need no credentials, so they were
done as part of the deploy rather than left for a manual pass:

- **`/api/stats` returns 401 unauthenticated.** The bearer gate is live, so the
  endpoint is not open to the internet.
- **`/privacy` returns 200 as a direct URL**, so the `vercel.json` SPA rewrite is
  working. Only the shell was checked — the page body renders client-side, and
  confirming the rendered content still wants a browser.
- **`VITE_GOOGLE_CLIENT_ID` is in the bundle** (see the ticked box above). This
  was the one with teeth: without it production ships a sign-in form that trusts
  any typed name.
- **`og:image` resolves**: `https://sigildeck.com/og-image.png`, HTTP 200,
  244823 bytes — byte-identical in size to the regenerated local file, so the
  new "A roguelite deckbuilder" card is the one being served.
- **The head is serving the new copy**: `description` and `og:description` both
  read "A roguelite deckbuilder…", confirming the deploy landed rather than
  Vercel serving a cached previous build.

### Still open, and why they could not be done from here

Every remaining box needs either a real browser session or a secret:

- **The signed-in write path** — the silent-data-loss regression. `api/runs.js`
  validates the batch (`:74`) before the auth gate (`:84`), so a synthetic probe
  is rejected with `400 no_valid_records` and never exercises `mayWriteAs`. Only
  a genuine signed-in run proves it.
- **A guest run reaching `runs`** — same reason.
- **`/admin` rendering** — needs `ADMIN_TOKEN`, which is deliberately not on
  this machine.
- **Issue 14's live check** — set a handle, win, confirm the run lists; then a
  handle-less win, confirm it does not. The client half is covered by
  `visual/copy-accuracy.spec.js`; the server half is this box.

### Handed over from issue 33 (2026-09-02)

Issue 33 put all five untested handlers under unit test, which pins their
control flow -- gates, filters, payload shapes -- but deliberately stops at the
SQL. Two things stay here because only real data can settle them:

- **The `/api/stats` aggregations compute the right numbers.** The unit tests
  assert that the dev filter and the version filter scope every query; they say
  nothing about whether a winrate is correct.
- **`/api/cron-backfill-runs` folds the right rows across.** Its authorization
  and idempotence clause are asserted; that the insert-select recovers exactly
  the missing runs, and no others, is a claim about the `profiles` and `runs`
  tables together.
