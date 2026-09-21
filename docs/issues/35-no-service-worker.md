---
id: 35
title: "No service worker: the PWA is manifest-only and the offline-first game needs a network"
priority: P3
area: performance
effort: M
status: declined
---

> **Declined 2026-09-20 (Joey).** Not wanted. An unattended run built this on `dawn/2026-09-19` (PR 20) and it was scrapped unmerged. Do not pick this issue, reopen it, or build toward it -- including as a dependency of 13.

## Problem

There is no service worker anywhere in the repo — `grep -rn "serviceWorker"`
over `src`, `public`, `index.html` and `scripts` returns nothing.

Everything around it is finished. `index.html` links a complete manifest, the
icon set covers 192/512/maskable/apple-touch (issue 04), and
`visual/head-and-manifest.spec.js` asserts the manifest is valid. What is
missing is the only part that makes any of it work offline.

## Why it matters

- **The game claims to be offline-first and is not.** Runs queue locally, an
  unreachable `/api/runs` is an expected state, naming is deliberately local so
  it works with no network (`api/_lib/handles.js`) — and then a player in a
  tunnel gets a blank page, because the app shell itself has to be fetched.
- **Chrome will not offer to install it.** The install prompt needs a service
  worker with a fetch handler; a manifest alone gets an entry in the browser
  menu on some platforms and nothing on others. iOS Add-to-Home-Screen works
  either way, which is why this has gone unnoticed.
- It is a card game with a 284KB bundle. Offline is a natural fit and a real
  reason to keep the tab.

`docs/RESPONSIVE_AND_PWA_PLAN.md` part 2 is the unbuilt half of an already
half-built plan.

## Suggested fix

Precache the shell — HTML, JS, CSS, icons, fonts (see issue 18, which should
land first so the fonts are local and cacheable at all). Network-first for
`/api/*`, which must never be served from cache.

**Do not precache `public/audio`.** It is 16MB today (issue 32) and would blow
past a reasonable storage budget on mobile for a bed the player may never hear.
Runtime-cache it on first play at most.

Three decisions to make explicitly and record here:

- **The update path.** A service worker that caches the shell and never
  revalidates serves a stale game forever, and it is the one bug that cannot be
  fixed by deploying a fix. Version the cache, clean old ones on `activate`, and
  decide between `skipWaiting` (fast, can swap code under a live run) and
  update-on-next-launch (safer for a game with a save). **Safer wins here.**
- **Scope for the itch build.** The standalone target mounts in a subdirectory
  behind a hash router (`src/buildTarget.js`, `scripts/build-itch.mjs`). A
  root-scoped worker is wrong there; the simplest correct answer is to ship no
  service worker in that target, since itch serves the whole bundle anyway.
- **Whether to hand-write it or add a plugin.** A hand-written worker is ~60
  lines and has no build-time dependency; `vite-plugin-pwa` is less code to own
  but adds a plugin to a build that currently has three.

Test it under the Playwright `prod` project — a service worker does not run
meaningfully against `vite dev`, and `*.prod.spec.js` against `vite preview` is
the existing pattern for exactly this class of thing.

## Acceptance criteria

- [ ] The app shell loads with the network offline
- [ ] `/api/*` is never served from cache
- [ ] A new deploy is picked up without the player clearing site data — proven
      by a test, not by reasoning
- [ ] The audio directory is not precached
- [ ] The itch standalone build is unaffected (`visual/itch-build.spec.js` green)
- [ ] The three decisions above are recorded in this file
- [ ] Add to issue 13: confirm the update path against the real deployment
      before inviting anyone, since a stale-shell bug cannot be fixed remotely
