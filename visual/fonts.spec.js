import { test, expect } from '@playwright/test'

// Self-hosted fonts (issue 18).
//
// Sigil is made entirely of typography -- there are no illustrations in `src/`
// at all -- so the fonts are not decoration, they are the art direction. Two
// things have to hold and neither is visible in the markup:
//
// 1. Nothing is fetched from Google. That was the issue: a render-blocking
//    @import chain across two hosts, and every visitor's IP disclosed to a
//    third party before they interacted with anything.
// 2. The weights still render as different weights. This is the one that could
//    regress silently. Cinzel and Inter are VARIABLE fonts, so all three Cinzel
//    faces are one byte-identical file and all four Inter faces are another --
//    Vite dedupes 14 declared faces down to 4 emitted files. That is correct,
//    because each @font-face pins the `wght` axis with a single font-weight
//    value. But it is correct in a way that looks exactly like the bug where
//    one static weight was vendored three times, and the difference is only
//    observable by rendering.

const GOOGLE = /fonts\.(googleapis|gstatic)\.com/

test.describe('fonts are self-hosted', () => {
  test('no request reaches a Google font host', async ({ page }) => {
    const thirdParty = []
    page.on('request', r => { if (GOOGLE.test(r.url())) thirdParty.push(r.url()) })

    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    expect(thirdParty).toEqual([])
  })

  test('the faces served are same-origin woff2', async ({ page }) => {
    const fonts = []
    page.on('request', r => { if (r.resourceType() === 'font') fonts.push(r.url()) })

    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    expect(fonts.length).toBeGreaterThan(0)
    for (const url of fonts) {
      expect(url, 'fonts must be same-origin').toMatch(/^http:\/\/localhost:/)
      expect(url).toMatch(/\.woff2(\?|$)/)
    }
  })

  test('both families actually load, rather than falling back', async ({ page }) => {
    await page.goto('/')

    // Asked for explicitly. A face is fetched only when something on the page
    // needs it, so `document.fonts` after load holds whichever subset the home
    // screen happened to use -- which is not the question being asked here.
    const loaded = await page.evaluate(async () => {
      await Promise.all(['600 16px Cinzel', '400 16px Inter'].map(f => document.fonts.load(f)))
      return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family)
    })

    expect(loaded).toContain('Cinzel')
    expect(loaded).toContain('Inter')
  })
})

test.describe('the weights are distinct', () => {
  // Measured rather than asserted from the CSS: a single variable file pinned to
  // three different `wght` values and the same file vendored three times as a
  // static weight produce identical stylesheets and different pixels.
  async function widths(page, family, weights) {
    return page.evaluate(async ({ family, weights }) => {
      // Every weight is requested before any is measured. Without this the
      // probe measures a fallback for whichever faces the page had not needed
      // yet, and a fallback is WIDER than Inter -- which reads as the weights
      // being ordered backwards rather than as the face being absent.
      await Promise.all(weights.map(w => document.fonts.load(`${w} 64px ${family}`)))

      const probe = document.createElement('span')
      probe.style.cssText =
        'position:fixed;left:-9999px;top:0;white-space:pre;font-size:64px;visibility:hidden'
      probe.style.fontFamily = family
      document.body.appendChild(probe)
      const out = {}
      for (const w of weights) {
        probe.style.fontWeight = String(w)
        probe.textContent = 'Sigil Handling'
        out[w] = probe.getBoundingClientRect().width
      }
      probe.remove()
      return out
    }, { family, weights })
  }

  test('Cinzel 500, 600 and 700 are three different weights', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const w = await widths(page, 'Cinzel', [500, 600, 700])

    // Heavier is wider in both of these faces. Asserting strict ordering rather
    // than mere inequality also catches the axis being pinned backwards.
    expect(w[500]).toBeLessThan(w[600])
    expect(w[600]).toBeLessThan(w[700])
  })

  test('Inter 400 through 700 are four different weights', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const w = await widths(page, 'Inter', [400, 500, 600, 700])

    expect(w[400]).toBeLessThan(w[500])
    expect(w[500]).toBeLessThan(w[600])
    expect(w[600]).toBeLessThan(w[700])
  })
})
