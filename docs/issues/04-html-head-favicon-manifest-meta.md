---
id: 04
title: "index.html has no favicon, manifest, description, or OG tags"
priority: P0
area: launch-blocker
effort: M
status: done
---

## Resolution

`index.html` went from 13 lines to a full head: title, description, icon set,
manifest, iOS standalone hints, and Open Graph / Twitter cards.

### Artwork

The mark is a **sigil** — the thing a run is spent collecting — drawn as the
four-pointed ✦ the UI already uses, in `--color-rune` on `--color-dungeon`. Two
flat colours and no fine detail, so it still reads at 16px in a tab.

`public/favicon.svg` is the single source. `scripts/generate-icons.mjs` rasterises
it (and two sibling SVGs) into `favicon-32.png`, `favicon.ico`,
`apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`,
`icon-512-maskable.png`, and `og-image.png` — via `npm run icons`.

It uses **Playwright's bundled Chromium**, already a devDependency, rather than
adding an image library for a job that runs a handful of times. `favicon.ico` is
produced by wrapping the 32px PNG in an ICO container (the format permits an
embedded PNG payload, so no bitmap re-encoding), which exists purely so clients
that probe `/favicon.ico` unprompted get a file instead of the 404 that made the
tab show a default globe.

The maskable variant is full-bleed with the sigil at ~73% of the 205px safe
radius. My first attempt scaled it to 72px, which would have looked like a dot
lost in the tile on Android — caught by rendering it and looking.

### Absolute URLs without hardcoding a domain

`og:image` and `og:url` should be absolute, and the domain is not knowable from
the source tree. A small Vite plugin (`htmlSiteUrl` in `vite.config.js`)
substitutes `__SITE_URL__` at build time from `VITE_SITE_URL`, else
`VERCEL_PROJECT_PRODUCTION_URL`. A plugin rather than `define`, because `define`
only reaches JS, not the HTML entry.

With neither set it resolves to `''`, leaving the paths relative — most scrapers
resolve those against the page URL, so a local build still previews sanely and
production on Vercel gets the absolute form for free. Both branches are verified.

### Also fixed

`theme-color` was `#1e293b` (slate-800) while the app renders on
`--color-dungeon: #0b0d12`, so browser chrome sat at a visibly different shade
from the page. Now matched, and a test pins them together.

### Tests

`visual/head-and-manifest.spec.js`, 11 tests. Most of them **fetch** the assets
rather than just asserting the markup — the original bug was a 404, which correct
markup would never have revealed. Covered: every icon href and every manifest icon
resolves 200; `/favicon.ico` resolves *and* has a valid ICO header; the manifest
parses and carries the fields Chrome needs before offering an install; the share
image resolves, is `image/png`, and its real IHDR dimensions match the declared
`og:image:width/height`.

### Not done

- **No service worker**, so no offline play. Deliberate: `docs/RESPONSIVE_AND_PWA_PLAN.md`
  treats it as separate, it is a much larger change, and installability does not
  need it. The manifest alone gets "Add to Home screen".
- **The share image text is rendered with a system serif**, not Cinzel. The PNG is
  rasterised once at authoring time and committed, so this affects nobody's
  browser — but it means the card is not in the game's exact display face. Using
  Cinzel would mean fetching and embedding the font in the SVG.

## Problem

`index.html` is 13 lines: charset, viewport, `theme-color`, title, root div,
module script. Consequences:

- Browser tab shows the default globe icon; `/favicon.ico` 404s on every load.
- Sharing the URL anywhere (Discord, Twitter, a text message) renders a bare
  link with no title, description, or image.
- No web manifest, so no install prompt and no home-screen icon on mobile.
- No `<meta name="description">`.

## Evidence

- `index.html` — 379 bytes total.
- `docs/RESPONSIVE_AND_PWA_PLAN.md` — Part 1 (responsive) partially landed; **Part 2
  (manifest, icon set, install prompt) was never implemented.** That document is
  the spec for this issue.

## Why it blocks batch 1

You invite the first cohort by sending them a link. That link is the first thing
they see, and right now it previews as nothing. This is the cheapest credibility
win available.

## Suggested fix

Follow Part 2 of `docs/RESPONSIVE_AND_PWA_PLAN.md`:

- Generate an icon set from the game's visual language (the rune/sigil motif in
  `src/index.css` is the obvious source). Minimum: `favicon.svg`,
  `favicon.ico` (32px), `apple-touch-icon.png` (180px), `icon-192.png`,
  `icon-512.png`, plus a maskable 512 variant.
- Add `public/manifest.webmanifest` with `name`, `short_name`, `display:
  "standalone"`, `background_color` / `theme_color` matching the existing
  `theme-color` meta, `orientation`, and the icon list.
- Add to `<head>`: manifest link, icon links, `<meta name="description">`,
  and OG/Twitter card tags (`og:title`, `og:description`, `og:image`,
  `og:url`, `twitter:card=summary_large_image`).
- Create a 1200×630 share image.

Keep it to the manifest and tags — a service worker / offline mode is a separate,
larger decision and is not needed for batch 1.

## Acceptance criteria

- [x] Favicon renders in the tab; no 404 for `/favicon.ico` (both asserted by fetch)
- [x] OG/Twitter tags present, share image resolves at the declared 1200×630
- [~] Pasting the deployed URL into Discord or Slack shows title, description, image — markup and assets verified, but **not** confirmed against a real scraper; needs a deployment
- [x] `manifest.webmanifest` validates, carries the install-required fields, and all its icons resolve
- [~] Lighthouse PWA installability — fields are in place, not run against a deployment
