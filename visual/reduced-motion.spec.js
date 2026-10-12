import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'

// Issue 17: under prefers-reduced-motion the four infinite animations stop,
// and the three that carry meaning (critical HP, boss card, tutorial cue)
// keep a static stand-in so the signal survives without motion.
//
// Each check reads computed style off the real element. The environment is
// asserted too: if the emulation silently failed, "no animation" would pass
// for the wrong reason.

async function motionOf(locator) {
  return locator.evaluate(el => {
    const s = getComputedStyle(el)
    return {
      name: s.animationName,
      iterations: s.animationIterationCount,
      shadow: s.boxShadow,
    }
  })
}

function isStopped({ name, iterations }) {
  return name === 'none' || iterations === '1'
}

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('critical HP keeps a static glow and stops pulsing', async ({ page }) => {
    const state = { ...DESCENT, hp: 3 }
    await page.addInitScript(({ saveKey, tutorialKey, state }) => {
      localStorage.setItem(tutorialKey, 'true')
      localStorage.setItem(saveKey, JSON.stringify({ version: 1, state }))
    }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, state })
    await page.goto('/')
    await page.locator('.card-face').first().waitFor({ timeout: 15000 })
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    const bar = page.locator('.animate-critical-pulse')
    await expect(bar).toHaveCount(1)
    const m = await motionOf(bar)
    expect(isStopped(m)).toBe(true)
    expect(m.shadow).not.toBe('none')

    // Nothing else in the room is still looping either.
    const looping = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter(el => {
        const s = getComputedStyle(el)
        return s.animationName !== 'none' && s.animationIterationCount === 'infinite'
          && !el.classList.contains('animate-spin')
      }).length)
    expect(looping).toBe(0)
  })

  test('boss cards and the rune pulse hold still with a static treatment', async ({ page }) => {
    await page.addInitScript(({ tutorialKey }) => {
      localStorage.setItem(tutorialKey, 'true')
    }, { tutorialKey: TUTORIAL_KEY })
    await page.goto('/')
    await page.locator('body').waitFor()
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)

    // A boss only turns up deep in a run, so the rule is checked against a
    // probe element carrying the same classes as a boss card face.
    const results = await page.evaluate(() => {
      const probe = (cls) => {
        const el = document.createElement('div')
        el.className = cls
        document.body.appendChild(el)
        const s = getComputedStyle(el)
        const out = { name: s.animationName, iterations: s.animationIterationCount, shadow: s.boxShadow }
        el.remove()
        return out
      }
      return { boss: probe('card-face is-boss'), rune: probe('rune-pulse') }
    })
    for (const m of Object.values(results)) {
      expect(isStopped(m)).toBe(true)
      expect(m.shadow).not.toBe('none')
    }
  })

  test('tutorial cue stays ringed without pulsing', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem('scoundrel:tutorialCompleted') } catch { /* ignore */ }
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Descend' }).click()
    const cue = page.locator('.tutorial-recommended').first()
    await cue.waitFor({ timeout: 10000 })
    const m = await motionOf(cue)
    expect(isStopped(m)).toBe(true)
    expect(m.shadow).toContain('251, 191, 36')
  })
})

test('without the setting, the infinite animations still run', async ({ page }) => {
  await page.goto('/')
  await page.locator('body').waitFor()
  const m = await page.evaluate(() => {
    const el = document.createElement('div')
    el.className = 'tutorial-recommended'
    document.body.appendChild(el)
    const s = getComputedStyle(el)
    const out = { name: s.animationName, iterations: s.animationIterationCount }
    el.remove()
    return out
  })
  expect(m).toEqual({ name: 'tutorialPulse', iterations: 'infinite' })
})
