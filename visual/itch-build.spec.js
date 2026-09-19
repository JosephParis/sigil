import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, extname, normalize, sep } from 'node:path'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'
import { zipEntryNames } from '../scripts/zip-dir.mjs'

/**
 * The standalone (itch.io) bundle, served the way itch serves it.
 *
 * itch unpacks the zip to https://html-classic.itch.zone/html/<project-id>/ --
 * a *subdirectory* on someone else's origin, inside an iframe. Every failure
 * mode that creates is silent:
 *
 *   - absolute asset paths resolve to the host's root and 404 (blank page)
 *   - a history router matches none of its routes (permanent catch-all)
 *   - audio.js builds its src strings at runtime, so Vite's `base` never
 *     touches them; the cues 404 into the deliberate silent-failure path and
 *     the game simply has no sound, with nothing logged
 *   - UI backed by /api renders fine and does nothing
 *
 * None of that reproduces on the dev server or in `vite preview`, both of which
 * serve from a root. So this spec builds the real artifact and serves it from a
 * nested path, which is the only arrangement where those bugs exist.
 *
 * The fake project id is arbitrary; what matters is that the game is not at "/".
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(root, 'dist-itch')
const MOUNT = '/html/12345'
const PORT = 4319
// Bind and navigate to the same literal address. `localhost` resolves to ::1
// first on Windows, so a server bound only to IPv4 can be shadowed by whatever
// already holds the IPv6 address -- and the page then loads someone else's
// bundle while every assertion here still reads as if it were ours.
const HOST = '127.0.0.1'

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

let server
/** Every request the page made, with the status it got. */
let requestLog = []

test.beforeAll(async () => {
  test.setTimeout(240_000)

  // Always rebuild, for the same reason playwright.config.js rebuilds dist/
  // before the prod project: a bundle left over from an earlier tree would
  // report on code that is not there any more.
  const built = spawnSync('node', ['scripts/build-itch.mjs'], {
    cwd: root, encoding: 'utf8', shell: true,
  })
  expect(built.status, `build:itch failed:\n${built.stdout}\n${built.stderr}`).toBe(0)

  server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`)
    let pathname = decodeURIComponent(url.pathname)

    // Anything outside the mount point is what the *portal* would answer, and
    // the portal knows nothing about this game. 404 is the honest answer, and
    // it is what turns an escaped absolute path into a visible failure.
    if (!pathname.startsWith(MOUNT + '/') && pathname !== MOUNT) {
      res.writeHead(404).end('not found')
      requestLog.push({ path: pathname, status: 404 })
      return
    }
    pathname = pathname.slice(MOUNT.length) || '/'
    if (pathname.endsWith('/')) pathname += 'index.html'

    // Keep traversal inside the served directory.
    const filePath = normalize(join(OUT_DIR, pathname))
    if (!filePath.startsWith(OUT_DIR + sep)) {
      res.writeHead(403).end('forbidden')
      requestLog.push({ path: pathname, status: 403 })
      return
    }

    try {
      const body = await readFile(filePath)
      res.writeHead(200, { 'content-type': TYPES[extname(filePath)] || 'application/octet-stream' })
      res.end(body)
      requestLog.push({ path: pathname, status: 200 })
    } catch {
      // Deliberately NOT an index.html fallback. itch serves static files and
      // 404s the rest; falling back here would hide exactly the bug this spec
      // exists to catch (see vercel.json's SPA rewrite, which does the same
      // thing in production and made a missing robots.txt look like a 200).
      res.writeHead(404).end('not found')
      requestLog.push({ path: pathname, status: 404 })
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(PORT, HOST, resolve)
  })
})

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve))
})

test.beforeEach(() => { requestLog = [] })

const BASE = `http://${HOST}:${PORT}${MOUNT}/`

/** Load the game and wait for it to be interactive. */
async function openGame(page) {
  const errors = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(String(err)))
  await page.goto(BASE)
  await expect(page.getByRole('button', { name: 'Home menu' })).toBeVisible({ timeout: 15_000 })
  return errors
}

test('the build exists and puts index.html at the top level', async () => {
  // The zip is made from the contents of this directory, so index.html being
  // here is the same condition as index.html being at the zip root -- which is
  // what itch requires to offer a "Play in browser" button at all.
  await expect(stat(join(OUT_DIR, 'index.html'))).resolves.toBeTruthy()
})

test('ships no service worker', async () => {
  // Issue 35: a root-scoped worker is wrong under itch's subdirectory, and itch
  // serves the whole bundle anyway, so the standalone target has none.
  await expect(stat(join(OUT_DIR, 'sw.js'))).rejects.toThrow()
  // Nor code that would register one: the call is compiled out of this target.
  const assets = join(OUT_DIR, 'assets')
  for (const name of (await readdir(assets)).filter(n => n.endsWith('.js'))) {
    expect(await readFile(join(assets, name), 'utf8'), name).not.toContain('/sw.js')
  }
})

test('the zip uses forward-slash entry names', async () => {
  // The bug this was written for, and the most expensive kind: every layer
  // reported success. PowerShell's Compress-Archive wrote entry names with
  // backslashes, itch accepted and unpacked the upload without complaint, and
  // served index.html correctly -- that entry sits at the root and so has no
  // separator to mangle. Everything under assets/ and audio/ became a file
  // *named* "assets\index-abc.js" at the root and 404'd. The page loaded, the
  // frame opened, and the game never started, with nothing logged anywhere
  // except the browser console of whoever thought to open it.
  const names = zipEntryNames(join(root, 'dist-itch.zip'))
  expect(names.length).toBeGreaterThan(0)

  const mangled = names.filter(n => n.includes('\\'))
  expect(mangled, 'ZIP entry names must use "/" (APPNOTE 4.4.17.1)').toEqual([])
  expect(names, 'index.html must be at the archive root').toContain('index.html')
  expect(names.some(n => n.startsWith('assets/')), 'assets/ must be a directory').toBe(true)
})

test('references no absolute paths that escape the mount point', async () => {
  const html = await readFile(join(OUT_DIR, 'index.html'), 'utf8')
  const refs = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1])
  const escaping = refs.filter(r => r.startsWith('/') && !r.startsWith('//'))
  expect(escaping, 'root-absolute references would resolve to the portal root').toEqual([])
})

test('loads and renders from a subdirectory with no failed requests', async ({ page }) => {
  const errors = await openGame(page)

  const missing = requestLog.filter(r => r.status === 404)
  expect(missing.map(m => m.path), 'requests the host could not answer').toEqual([])
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([])
})

test('routes with the hash router', async ({ page }) => {
  // The distinguishing behaviour, and the reason the router is switched at all:
  // under BrowserRouter the hash is not part of the path, so the path here is
  // /html/12345/, which matches no route and falls through to the catch-all
  // Navigate. The privacy page would be unreachable. Under HashRouter it loads.
  await page.goto(`${BASE}#/privacy`)
  await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible({ timeout: 15_000 })
})

test('resolves audio through the mount point, not the host root', async ({ page }) => {
  // The regression this spec was written for. audio.js registers '/audio/...'
  // and assetUrl() rebases it; without that the request goes to the portal's
  // root, 404s, and Howler swallows it -- a completely silent loss of all sound.
  await openGame(page)

  // What the bundle actually asks for. Howler resolves the src it is handed
  // against the document, so capturing a real request is the assertion that
  // cannot pass for the wrong reason.
  const audioRequests = []
  page.on('request', req => {
    if (req.url().includes('/audio/')) audioRequests.push(new URL(req.url()).pathname)
  })

  // Music is bound to game.phase (index.jsx), and the phases a fresh save
  // passes through -- menu, tutorial -- have no track. So the run has to be
  // *in* a descent for there to be any audio to get wrong. Space dismisses the
  // theme intro and doubles as the gesture that satisfies autoplay policy.
  await page.evaluate(([saveKey, tutorialKey, state]) => {
    localStorage.setItem(tutorialKey, 'true')
    localStorage.setItem(saveKey, JSON.stringify({ version: 1, state }))
  }, [SAVE_KEY, TUTORIAL_KEY, DESCENT])
  await page.reload()
  await page.locator('.card-face').first().waitFor({ timeout: 15_000 })
  await page.keyboard.press('Space')

  await expect
    .poll(() => audioRequests.length, { timeout: 15_000, message: 'no audio was ever requested' })
    .toBeGreaterThan(0)

  for (const path of audioRequests) {
    expect(path.startsWith(`${MOUNT}/audio/`), `audio requested outside the mount: ${path}`).toBe(true)
  }
  expect(requestLog.filter(r => r.status === 404 && r.path.includes('audio'))).toEqual([])
})

test('offers no UI that needs the server', async ({ page }) => {
  await openGame(page)
  await page.getByRole('button', { name: 'Home menu' }).click()

  // These are the entries whose backing endpoint cannot be reached. Offering
  // them would render a permanently empty modal.
  await expect(page.getByRole('button', { name: 'Leaderboard' })).toHaveCount(0)
  await expect(page.getByText('sigildeck.com')).toBeVisible()
})

/** The stage's on-screen box, and what it was asked to fit into. */
function measureStage(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.stage')
    const rect = stage.getBoundingClientRect()
    return {
      scale: Number(getComputedStyle(stage).getPropertyValue('--stage-scale')),
      layoutHeight: stage.scrollHeight,
      renderedHeight: rect.height,
      renderedTop: rect.top,
      frameHeight: document.documentElement.clientHeight,
    }
  })
}

test('a screen taller than the frame is scaled to fit it', async ({ page }) => {
  // itch fixes the iframe at the configured viewport and does not scroll its
  // document, so anything past the fold is gone -- no scrollbar, no indication.
  // The sanctuary runs ~870px at 1280 wide and DESCEND sits at the bottom of it.
  //
  // 600 is deliberately shorter than any embed height that would be configured,
  // so the scale has to engage. The assertion that matters is the rendered
  // height landing on the frame: content taller than the frame is the failure
  // being fixed, and content shorter than it would mean the fit overshot.
  await page.setViewportSize({ width: 1280, height: 600 })
  await openGame(page)

  const stage = await measureStage(page)
  expect(stage.layoutHeight, 'nothing overflows; pick a shorter viewport')
    .toBeGreaterThan(stage.frameHeight + 2)
  expect(stage.scale, 'the stage was not scaled down').toBeLessThan(1)
  expect(stage.renderedTop, 'the stage is not flush with the top of the frame').toBeCloseTo(0, 0)
  // Sub-pixel rounding in the compositor, not slack in the fit.
  expect(stage.renderedHeight, 'the scaled app does not fill the frame exactly')
    .toBeCloseTo(stage.frameHeight, 0)

  // The button the bug hid. Its own box, not the stage's, so a stage that fits
  // while still clipping its last child cannot pass.
  const descend = page.getByRole('button', { name: 'DESCEND' })
  await expect(descend).toBeVisible()
  const box = await descend.boundingBox()
  expect(box.y + box.height, 'DESCEND is below the bottom of the frame')
    .toBeLessThanOrEqual(stage.frameHeight)
})

test('nothing scrolls, at any frame height', async ({ page }) => {
  // The point of scaling rather than scrolling. A scroll offset that can exist
  // is a scroll offset that can be wrong when a modal opens over it, and asking
  // a player to scroll a game is the thing being avoided in the first place.
  for (const height of [600, 720, 900]) {
    await page.setViewportSize({ width: 1280, height })
    await openGame(page)

    // The fit is applied by the app after layout, not by CSS, so a single
    // measurement can land on the unscaled frame and read as "content past the
    // bottom" -- which is exactly what this test is looking for, and a false
    // one. Poll until the fit has engaged; a fit that never engages still
    // fails, just after the timeout rather than immediately.
    await expect.poll(
      () => page.evaluate(() => {
        const root = document.getElementById('root')
        return root.scrollHeight - root.clientHeight
      }),
      { message: `#root has content past the frame at ${height}px` },
    ).toBeLessThanOrEqual(1)

    const overflow = await page.evaluate(() => {
      const root = document.getElementById('root')
      window.scrollTo(0, 99_999)
      root.scrollTop = 99_999
      return {
        docTop: window.scrollY,
        rootTop: root.scrollTop,
        rootOverflow: root.scrollHeight - root.clientHeight,
      }
    })
    expect(overflow.docTop, `document scrolled at ${height}px`).toBe(0)
    expect(overflow.rootTop, `#root scrolled at ${height}px`).toBe(0)
    expect(overflow.rootOverflow, `#root has content past the frame at ${height}px`)
      .toBeLessThanOrEqual(1)
  }
})

test('a frame tall enough for the content is left at full size', async ({ page }) => {
  // Scaling is a fallback, not the normal case: at the recommended 1280x900
  // embed the sanctuary fits outright and the app must render pixel-for-pixel,
  // not shrunk to some fixed design height it was never laid out against.
  await page.setViewportSize({ width: 1280, height: 900 })
  await openGame(page)

  const stage = await measureStage(page)
  expect(stage.layoutHeight, '900 no longer clears the tallest screen; raise the embed height')
    .toBeLessThanOrEqual(stage.frameHeight)
  expect(stage.scale, 'content that fits was scaled anyway').toBe(1)
})

test('the default build is unaffected', async ({ page }) => {
  // The whole point of a separate target: everything above must be invisible to
  // the bundle that ships. Asserted against the dev server, which is the
  // default target, so a stray unconditional change here fails loudly.
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Home menu' })).toBeVisible()
  expect(page.url()).not.toContain('#/')
  // The embedded layout must not leak onto the site, where the document scrolls
  // normally. The stage is the stricter of the two: a transform on an ancestor
  // silently re-homes every `position: fixed` element in the app, so its
  // absence here is worth asserting on its own rather than via the class.
  await expect(page.locator('html')).not.toHaveClass(/embedded/)
  await expect(page.locator('.stage')).toHaveCount(0)
})
