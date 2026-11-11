import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'
import { dailySeed, formatSeed, todayUtc } from '../src/games/scoundrel/seed.js'

// The link that opens today's Daily, /?daily (issue 46). A brand-new player
// lands in the tutorial, which does not offer the Daily, so a post saying
// "try today's Daily" needs a link that goes straight there. Every test here
// starts from a profile that has never finished the tutorial, because that is
// the player the link is for.
//
// Storage is set with page.evaluate after a first load, not addInitScript, so
// the navigation to the link does not put back what the test removed.

const TODAY = todayUtc()
const TODAY_SEED = dailySeed(TODAY)

const saved = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.state ?? null, SAVE_KEY)

async function open(page, path, { game = null } = {}) {
  await page.goto('/')
  await page.evaluate(({ saveKey, game }) => {
    localStorage.clear()
    if (game) localStorage.setItem(saveKey, JSON.stringify({ version: 1, state: game }))
  }, { saveKey: SAVE_KEY, game })
  await page.goto(path)
  await page.getByRole('button', { name: 'Home menu' }).waitFor()
}

test.describe('the Daily link (issue 46)', () => {
  test('a first visit to /?daily starts today’s Daily, past the tutorial', async ({ page }) => {
    await open(page, '/?daily')
    await expect(page.getByTestId('daily-date')).toBeVisible()
    await expect(page.getByTestId('opening-seed')).toHaveText(formatSeed(TODAY_SEED))
    await expect(page.getByRole('button', { name: 'Skip tutorial' })).toHaveCount(0)

    const state = await saved(page)
    expect(state.daily).toBe(TODAY)
    expect(state.tutorial).toBe(false)
    // Taken out of the address bar, so a reload does not start it again.
    expect(new URL(page.url()).searchParams.has('daily')).toBe(false)
    // Skipped for this run only: the tutorial still waits for their own run.
    expect(await page.evaluate(k => localStorage.getItem(k), TUTORIAL_KEY)).toBeNull()
  })

  test('a first visit without it still opens the tutorial', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByRole('button', { name: 'Skip tutorial' })).toBeVisible()
    expect((await saved(page))?.daily ?? null).toBeNull()
  })

  test('wins over a seed in the same link', async ({ page }) => {
    await open(page, '/?daily&seed=K7Q2-M9XD')
    expect((await saved(page)).seed).toBe(TODAY_SEED)
    const url = new URL(page.url())
    expect(url.searchParams.has('daily') || url.searchParams.has('seed')).toBe(false)
  })

  test('does not throw away a run in progress, and says how to play it later', async ({ page }) => {
    await open(page, '/?daily', { game: { ...DESCENT, seed: 'K7Q2M9XD' } })
    await expect(page.getByText(/today’s Daily was not started/)).toBeVisible()
    const state = await saved(page)
    expect(state.phase).toBe('descent')
    expect(state.seed).toBe('K7Q2M9XD')
    expect(state.daily ?? null).toBeNull()
  })

  test('carries on with today’s Daily if that is the run in progress', async ({ page }) => {
    await open(page, '/?daily', {
      game: { ...DESCENT, seed: TODAY_SEED, seedChosen: true, daily: TODAY, hp: 7 },
    })
    await expect(page.getByText(/was not started/)).toHaveCount(0)
    const state = await saved(page)
    expect(state.phase).toBe('descent')
    expect(state.hp).toBe(7)
  })

  test('starts the Daily over a finished run', async ({ page }) => {
    await open(page, '/?daily', { game: { ...DESCENT, phase: 'gameover', hp: 0 } })
    await expect(page.getByTestId('daily-date')).toBeVisible()
    expect((await saved(page)).daily).toBe(TODAY)
  })

  test('the Daily’s panels copy the link, not the seed', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, '/?daily')
    await page.getByRole('button', { name: 'Copy Daily link' }).click()
    await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    const url = new URL(copied)
    expect(url.pathname).toBe('/')
    expect(url.search).toBe('?daily')

    // The end of an attempt offers it too.
    await page.evaluate(({ key, state }) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, state }))
    }, { key: SAVE_KEY, state: { ...DESCENT, phase: 'gameover', hp: 0, sigilsEarned: 1, seed: TODAY_SEED, seedChosen: true, daily: TODAY } })
    await page.goto('/')
    await expect(page.getByTestId('daily-outcome').getByRole('button', { name: 'Copy Daily link' })).toBeVisible()
  })
})
