import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// The service worker (issue 35).
//
// `prod` project only: the worker is written by the build and there is no
// sw.js under `vite dev`. vite preview serves dist/ straight off disk, which is
// what lets the update test below stand in for a second deploy by rewriting
// dist/sw.js and dist/index.html between page loads.

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

// page.goto resolves on `load`, but the game is behind a lazy import; wait for
// a real element before believing the shell booted.
async function booted(page) {
  await expect(page.getByRole('button', { name: 'More options' })).toBeVisible()
}

// Until the worker controls the page, nothing is cached and nothing is proven.
async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

async function cachedPaths(page) {
  return page.evaluate(async () => {
    const out = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const req of await cache.keys()) out.push(new URL(req.url).pathname)
    }
    return out
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoundrel:tutorialCompleted', 'true')
  })
})

test('the shell loads with the network offline', async ({ page, context }) => {
  await page.goto('/')
  await booted(page)
  await controlled(page)

  await context.setOffline(true)
  try {
    await page.reload()
    await booted(page)
    // A deep link is the same shell, and must not need the network either.
    await page.goto('/privacy')
    await expect(page.locator('#root')).not.toBeEmpty()
  } finally {
    await context.setOffline(false)
  }
})

test('/api is never answered from cache', async ({ page, context }) => {
  await page.goto('/')
  await booted(page)
  await controlled(page)

  expect((await cachedPaths(page)).filter(p => p.startsWith('/api/'))).toEqual([])

  // Offline, an API call must fail like a network error. A worker that cached
  // it would hand back a stale response instead.
  await context.setOffline(true)
  try {
    const outcome = await page.evaluate(() =>
      fetch('/api/leaderboard').then(() => 'answered', () => 'network-error'),
    )
    expect(outcome).toBe('network-error')
  } finally {
    await context.setOffline(false)
  }
})

test('the audio directory is not precached', async ({ page }) => {
  await page.goto('/')
  await booted(page)
  await controlled(page)
  const paths = await cachedPaths(page)
  expect(paths).toContain('/index.html')
  expect(paths.filter(p => p.startsWith('/audio/'))).toEqual([])
})

test('a new deploy is picked up on the next launch without clearing site data', async ({ page, context }) => {
  await page.goto('/')
  await booted(page)
  await controlled(page)

  const swPath = DIST + 'sw.js'
  const htmlPath = DIST + 'index.html'
  const [sw, html] = await Promise.all([readFile(swPath, 'utf8'), readFile(htmlPath, 'utf8')])
  const MARK = '<meta name="sigil-deploy" content="second">'

  try {
    // "Deploy" a second build: a new worker version and a visibly new shell.
    await writeFile(swPath, sw.replace(/const VERSION = '([^']*)'/, "const VERSION = '$1-second'"))
    await writeFile(htmlPath, html.replace('</head>', `${MARK}</head>`))

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg.update()
    })
    // Safer-wins update path: the new worker installs and then waits, so the
    // tab already open keeps the shell it started with.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg.waiting !== null
    })

    // Next launch: every tab on the old worker closes, a fresh one opens.
    // The browser activates the waiting worker once no client holds the old
    // one, which is asynchronous, so the relaunch is polled rather than timed.
    // Navigating before that would make the new tab a client of the old worker
    // and hold the update back again, so wait on the worker itself first.
    const next = await context.newPage()
    await page.close()
    await expect.poll(async () => {
      for (const w of context.serviceWorkers()) {
        const settled = await w.evaluate(() =>
          self.registration.waiting === null && self.registration.active?.state === 'activated',
        ).catch(() => false)
        if (settled) return true
      }
      return false
    }, { timeout: 15000 }).toBe(true)
    await expect.poll(async () => {
      await next.goto('/')
      return next.locator('meta[name="sigil-deploy"]').count()
    }, { timeout: 15000 }).toBe(1)
    await booted(next)

    // And it is the new shell that is cached: offline still shows it, and the
    // old version's cache is gone.
    const names = await next.evaluate(() => caches.keys())
    expect(names).toHaveLength(1)
    expect(names[0]).toMatch(/-second$/)
    await context.setOffline(true)
    try {
      await next.reload()
      await booted(next)
      await expect(next.locator('meta[name="sigil-deploy"]')).toHaveCount(1)
    } finally {
      await context.setOffline(false)
    }
  } finally {
    await Promise.all([writeFile(swPath, sw), writeFile(htmlPath, html)])
  }
})
