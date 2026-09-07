---
id: 18
title: "Google Fonts loaded via render-blocking CSS @import"
priority: P3
area: performance
effort: S
status: done
---

## Problem

`src/index.css:1`:

```css
@import url('https://fonts.googleapis.com/css2?family=Cinzel...&family=Inter...');
```

A CSS `@import` to a third-party host is the slowest way to load a font. It
creates a serial dependency chain: the browser must download and parse your CSS
before it even discovers the font CSS URL, then fetch *that*, then fetch the font
files themselves. Three round trips to two hosts before any text renders, all of
it blocking.

Bundlers generally can't optimize this away — the `@import` stays in the emitted
CSS as-is.

## Why it matters

- It's on the critical rendering path for every visit, and it's the first thing
  that happens. Directly hurts First Contentful Paint and Largest Contentful
  Paint — the numbers Speed Insights is already reporting to you.
- Worst on mobile over cellular, where the extra DNS + TLS handshakes to
  `fonts.googleapis.com` and `fonts.gstatic.com` cost the most.
- **Privacy**: every visitor's IP is disclosed to Google on page load, before any
  consent or interaction. This is the specific pattern that has drawn GDPR
  attention in the EU, and it interacts with issue 06 — if you publish a privacy
  policy, this has to be disclosed or removed.

## Resolution (2026-09-02, landed on its own 2026-09-06)

**Done. Found by the Steam port, but fixed on this issue's own terms.**

Landed here without the Steam work. The port was shelved indefinitely on
2026-09-06 with its branch unmerged, and this fix had no business being shelved
with it: two blocking round trips to a third party before first paint, and every
visitor's IP handed to Google to get them, are the web build's problems and were
this issue's argument long before an offline build existed. So the fonts, the
generator and the `@import` swap were cherry-picked out of `steam/desktop-shell`
and nothing else came with them -- no Electron, no `html.desktop` rules, no
build target.

`visual/steam-build.spec.js` asserts the desktop build makes no network
requests at all, and it failed on its first run against exactly this: three
requests to `fonts.googleapis.com` and `fonts.gstatic.com` on startup. That
matters more in an installed application than it ever did on the web, because
the Steam build is **offline** and Sigil is made of typography -- there are no
illustrations in `src/` at all. A player with no network was getting the whole
game in Georgia and system-ui.

What shipped, and where it differs from the suggestion below:

- `scripts/fetch-fonts.mjs` vendors the woff2 subsets and generates
  `src/fonts.css`. Run by hand (`npm run fonts`), output committed -- a build
  that reached out to Google would be the thing this removes.
- The files live in **`src/fonts/`, not `public/fonts/`**. `public/` is
  referenced by root-absolute path, and a root-absolute path is precisely what
  breaks under itch's subdirectory and the Steam build's `file://` origin.
  Under `src/` they go through Vite's asset pipeline and come out rebased
  against each target's `base`.
- **Inter 300 was dropped**: nothing in `src/` uses `font-light`. Inter 400 was
  kept although no class requests it, because it is the default weight of every
  unstyled run of body text.
- 14 faces (Cinzel 500/600/700, Inter 400/500/600/700, latin + latin-ext),
  639KB on disk. **What ships is far less than that, and the 639 overstates it
  by 3.7x.** Both families are VARIABLE fonts, so all three Cinzel faces are one
  byte-identical file and all four Inter faces are another; Vite dedupes the 14
  down to **4 emitted files, 174KB**, and `unicode-range` then means a browser
  on latin text fetches two of them, about **72KB**.
- That dedupe is correct but looks exactly like the bug where one static weight
  is vendored under three names, and the two are indistinguishable in the CSS:
  each `@font-face` pins the `wght` axis with a single `font-weight`, which a
  variable file honours and a static one cannot. The difference is only visible
  in rendered pixels, so `visual/fonts.spec.js` measures it -- three Cinzel
  weights and four Inter weights, each strictly wider than the last.
- SIL OFL text vendored at `src/fonts/OFL.txt`.

Not done: the `<link rel="preload">` for the above-the-fold faces. Worth a
follow-up for the web build; it does nothing for Steam, where the fonts are
already local.

## Suggested fix

**Preferred: self-host the fonts.** Solves performance and privacy together.

1. Download the Cinzel and Inter woff2 subsets you actually use — check which
   weights are referenced before pulling all of them; unused weights are pure
   payload.
2. Place them in `public/fonts/`.
3. Replace the `@import` with local `@font-face` declarations using
   `font-display: swap` so text renders immediately in the fallback.
4. Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` in
   `index.html` for the one or two faces used above the fold.

Both fonts are open licensed (SIL OFL), so self-hosting is permitted — include
the license files alongside them.

**Fallback if self-hosting is rejected:** at minimum move the request out of CSS
into `index.html` as `<link rel="preconnect" href="https://fonts.gstatic.com"
crossorigin>` plus a `<link rel="stylesheet">`. Removes one round trip but keeps
the privacy exposure, so this is strictly the lesser option.

While here: define a sensible `font-family` fallback stack so the game is
readable even if fonts fail entirely.

## Acceptance criteria

- [x] No `@import` to a third-party host in `src/index.css`
- [x] No requests to `fonts.googleapis.com` or `fonts.gstatic.com` on page load
- [x] Fonts render with `font-display: swap`; no invisible-text flash
- [x] Only the weights actually used are shipped
- [x] OFL license files included with the self-hosted fonts
- [x] The weights still render as distinct weights (`visual/fonts.spec.js`)
- [ ] FCP/LCP measured before and after, recorded in the commit — **not done**,
      and deliberately not blocking: the two removed round trips are the
      mechanism, and a number measured on one laptop would not travel.
