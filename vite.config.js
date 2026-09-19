import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { precacheUrls } from './scripts/sw-precache.mjs'

// Build stamp. Resolved once when the config loads (i.e. at build time), then
// frozen into the client bundle via `define` below so the site can show which
// build it's running. Self-updating: nothing to hand-edit per deploy.
//
// On Vercel the git SHA/branch come from the build env (no repo access needed
// in the container); locally we fall back to `git`. All of this is public for
// a public repo, so it's safe to ship to the browser.
function gitShort() {
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim()
  } catch {
    return ''
  }
}

const fullSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
const buildSha = (fullSha ? fullSha.slice(0, 7) : gitShort()) || 'dev'
const buildRef = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || ''
const buildTime = new Date().toISOString()

// Absolute origin for the social-card tags (issue 04). og:image and og:url are
// supposed to be absolute, and the domain is not knowable from the source tree,
// so it is resolved at build time instead of hardcoded:
//
//   VITE_SITE_URL                    explicit override, wins if set
//   VERCEL_PROJECT_PRODUCTION_URL    the project's canonical production domain
//
// Falls back to '', which leaves the paths relative. Most scrapers resolve those
// against the page URL anyway, so a local build still previews sanely; production
// on Vercel gets the absolute form for free.
function siteUrl() {
  const explicit = process.env.VITE_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`
  return ''
}

// Substitutes __SITE_URL__ in index.html. A plugin rather than `define`, because
// `define` only reaches JS, not the HTML entry.
function htmlSiteUrl() {
  const origin = siteUrl()
  return {
    name: 'scoundrel-html-site-url',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_URL__', origin)
    },
  }
}

// The standalone target (itch.io and any other portal that hosts the bundle as
// static files inside an iframe). See src/buildTarget.js for what it changes and
// why. Everything below is a no-op unless VITE_BUILD_TARGET says otherwise, so
// the sigildeck.com build is untouched.
const isStandalone = process.env.VITE_BUILD_TARGET === 'standalone'

// Drops the web-app manifest from the standalone HTML.
//
// manifest.webmanifest hardcodes "start_url": "/" and absolute icon paths, all
// of which point at the portal's root rather than the game's directory. Rather
// than ship a second manifest whose every path is wrong, the standalone build
// has none: it is an embedded iframe, so it was never installable anyway.
function htmlStandalone() {
  return {
    name: 'sigil-html-standalone',
    apply: () => isStandalone,
    transformIndexHtml(html) {
      return html.replace(/^\s*<link rel="manifest"[^>]*>\s*$/m, '')
    },
  }
}

// Writes dist/sw.js after the build (issue 35).
//
// Hand-written rather than vite-plugin-pwa: the worker is ~50 lines in
// src/sw/worker.js and this is the whole of its build step. It runs after
// public/ has been copied, so the precache list is the real output directory
// (hashed bundles, fonts, icons) filtered by scripts/sw-precache.mjs.
//
// The version is the build stamp, so every deploy yields a byte-different
// sw.js, which is what makes the browser install the new worker.
//
// Not in the standalone build: itch serves the bundle from a subdirectory on
// its own origin and ships the whole thing anyway, so a worker there has
// nothing to add and a root scope to get wrong.
function serviceWorker() {
  let outDir
  return {
    name: 'sigil-service-worker',
    apply: (_config, { command }) => command === 'build' && !isStandalone,
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
        .filter(d => d.isFile())
        .map(d => relative(outDir, join(d.parentPath ?? d.path, d.name)))
      const template = await readFile(new URL('./src/sw/worker.js', import.meta.url), 'utf8')
      const worker = template
        .replace('__SW_VERSION__', `${buildSha}-${buildTime}`)
        .replace('const PRECACHE = __SW_PRECACHE__', 'const PRECACHE = ' + JSON.stringify(precacheUrls(files), null, 2))
      await writeFile(join(outDir, 'sw.js'), worker)
    },
  }
}

// The device lab (visual/lab/index.html), served at /lab.
//
// `apply: 'serve'` and the configureServer-only hook mean it exists in `vite
// dev` and nowhere else: it is not in public/, so no build copies it, and no
// deployment can expose it. That matters because it is a tool for looking at
// the app, not part of it.
//
// It is served from the app's own origin on purpose. The lab writes the game's
// localStorage keys and its frames read them back, which only works same-origin
// -- an html file opened over file:// would be a different origin and could
// seed nothing.
//
// The device and screen list is injected from visual/fixtures/devices.js, the
// same module visual/mobile-no-scroll.spec.js imports, so the lab you look at
// and the guard CI runs can never drift.
function deviceLab() {
  return {
    name: 'sigil-device-lab',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/lab', async (req, res, next) => {
        // Only the page itself; anything deeper is not ours.
        if (req.url !== '/' && req.url !== '') return next()
        try {
          const [html, fixtures] = await Promise.all([
            readFile(new URL('./visual/lab/index.html', import.meta.url), 'utf8'),
            import('./visual/fixtures/devices.js'),
          ])
          const data = JSON.stringify({
            VIEWPORTS: fixtures.VIEWPORTS,
            SCREENS: fixtures.SCREENS,
          })
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html.replace('__DEVICE_FIXTURES__', data))
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

export default defineConfig({
  // './' so the bundle works from any directory depth. itch serves it from
  // /html/<project-id>/, and an absolute base would send every asset request to
  // the portal's root.
  base: isStandalone ? './' : '/',
  plugins: [react(), tailwindcss(), htmlSiteUrl(), htmlStandalone(), deviceLab(), serviceWorker()],
  define: {
    // Override entries on import.meta.env so client code reads them with no
    // extra globals and ESLint stays happy. Values are inlined at build time.
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildSha),
    'import.meta.env.VITE_BUILD_REF': JSON.stringify(buildRef),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
    // Inlined rather than left to Vite's own VITE_* env handling so the value is
    // always a string: `'' === 'standalone'` is false, whereas an undefined
    // replacement would leave a bare `undefined` in the output.
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify(process.env.VITE_BUILD_TARGET || ''),
  },
  build: {
    // A separate directory so an itch build can never be mistaken for the one
    // that deploys, and so `vite preview` and the prod test project keep
    // pointing at the real thing.
    outDir: isStandalone ? 'dist-itch' : 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/[\\/]node_modules[\\/]posthog-js[\\/]/.test(id)) return 'posthog'
        },
      },
    },
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(d => !/(^|\/)posthog[-.]/.test(d)),
    },
  },
})
