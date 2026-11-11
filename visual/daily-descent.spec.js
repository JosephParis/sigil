import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'
import { dailySeed, formatSeed, todayUtc } from '../src/games/scoundrel/seed.js'

// The Daily Descent (issue 42), end to end: started from the opening visit, on
// default rules, the same seed on every attempt that day, and an end screen
// that offers another go and the daily board.
//
// There is no /api in `vite dev`, so the board's response is supplied with
// page.route; what the real database returns is on issue 13's checklist.
//
// Storage is set with page.evaluate after the first load, not addInitScript,
// so a reload does not put back what the test has since changed.

const TODAY = todayUtc()
const TODAY_SEED = dailySeed(TODAY)
const HISTORY_KEY = 'scoundrel:history:guest'

const saved = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.state ?? null, SAVE_KEY)

async function start(page, { query = '', game = null, records = null } = {}) {
  await page.goto('/')
  await page.evaluate(({ saveKey, tutorialKey, historyKey, game, records }) => {
    localStorage.clear()
    localStorage.setItem(tutorialKey, 'true')
    if (game) localStorage.setItem(saveKey, JSON.stringify({ version: 1, state: game }))
    if (records) localStorage.setItem(historyKey, JSON.stringify(records))
  }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, historyKey: HISTORY_KEY, game, records })
  await page.goto(`/${query}`)
  await page.getByRole('button', { name: 'Home menu' }).waitFor()
}

// A finished attempt at today's Daily, as the save slot holds it.
const finishedDaily = (overrides = {}) => ({
  ...DESCENT,
  phase: 'gameover',
  hp: 0,
  sigilsEarned: 2,
  seed: TODAY_SEED,
  seedChosen: true,
  daily: TODAY,
  ...overrides,
})

test.describe('the Daily Descent', () => {
  test('starts from the opening visit on the day\'s seed, with the pickers hidden', async ({ page }) => {
    // Modes on, so hiding the mode picker is something the daily does, not
    // something the launch flags already did.
    await start(page, { query: '?flag-modes=1' })
    await expect(page.getByRole('heading', { name: 'Run mode' })).toBeVisible()

    await page.getByRole('button', { name: 'Play today’s Daily' }).click()

    await expect(page.getByTestId('daily-date')).toBeVisible()
    await expect(page.getByTestId('opening-seed')).toHaveText(formatSeed(TODAY_SEED))
    await expect(page.getByRole('heading', { name: 'Run mode' })).toHaveCount(0)
    // The day's seed is not one to swap for a friend's.
    await expect(page.getByRole('button', { name: "Play a friend's seed" })).toHaveCount(0)

    const state = await saved(page)
    expect(state.daily).toBe(TODAY)
    expect(state.seed).toBe(TODAY_SEED)
    expect(state.seedChosen).toBe(true)
    expect(state.mode).toBe('default')
    expect(state.ascension).toBe(0)
  })

  test('gives the same seed on a second start, and can be left for your own dungeon', async ({ page }) => {
    await start(page)
    const own = (await saved(page)).seed

    await page.getByRole('button', { name: 'Play today’s Daily' }).click()
    await expect(page.getByTestId('opening-seed')).toHaveText(formatSeed(TODAY_SEED))

    await page.getByRole('button', { name: 'Play your own dungeon instead' }).click()
    const left = await saved(page)
    expect(left.daily ?? null).toBeNull()
    expect(left.seed).not.toBe(TODAY_SEED)
    expect(left.seed).not.toBe(own)

    await page.getByRole('button', { name: 'Play today’s Daily' }).click()
    expect((await saved(page)).seed).toBe(TODAY_SEED)
  })

  test('ends with another go and the daily board, which ranks sigils and time', async ({ page }) => {
    let asked = null
    await page.route('**/api/leaderboard**', route => {
      asked = new URL(route.request().url())
      return route.fulfill({
        json: {
          generatedAt: Date.now(), version: null, seed: TODAY_SEED, daily: TODAY, limit: 25,
          entries: [
            { rank: 1, playerName: 'Rookwarden', ascension: 0, sigilsEarned: 6, durationMs: 1_500_000, endedAt: Date.now(), mode: 'default', gameVersion: '0.4', you: false },
            { rank: 2, playerName: null, ascension: 0, sigilsEarned: 1, durationMs: 240_000, endedAt: Date.now(), mode: 'default', gameVersion: '0.4', you: true },
          ],
          self: null, selfInPage: true,
        },
      })
    })
    await start(page, { game: finishedDaily() })

    const panel = page.getByTestId('daily-outcome')
    await expect(panel).toContainText('Daily Descent')
    await expect(panel).toContainText('2 sigils')
    // A daily lists deaths with a sigil, so the name question is asked here too.
    await expect(page.getByText(/listed on the daily board/)).toBeVisible()
    // Its race is the daily board, not a friend's time on the seed.
    await expect(page.getByTestId('seed-challenge')).toHaveCount(0)

    await panel.getByRole('button', { name: 'Daily board' }).click()
    await expect(page.getByRole('heading', { name: /Daily Descent/ })).toBeVisible()
    expect(asked.searchParams.get('daily')).toBe(TODAY)
    expect(asked.searchParams.get('seed')).toBeNull()
    const sigils = page.getByTestId('board-sigils')
    await expect(sigils).toHaveText(['6 sigils', '1 sigil'])
    await expect(page.getByText('25:00')).toBeVisible()
    await expect(page.getByText('04:00')).toBeVisible()
    await page.getByRole('button', { name: 'Close leaderboard' }).click()

    await panel.getByRole('button', { name: 'Try the Daily again' }).click()
    await expect(page.getByTestId('daily-date')).toBeVisible()
    const again = await saved(page)
    expect(again.phase).toBe('sanctuary')
    expect(again.sigilsEarned).toBe(0)
    expect(again.daily).toBe(TODAY)
    expect(again.seed).toBe(TODAY_SEED)
  })

  test('an attempt from an earlier day offers today\'s Daily instead', async ({ page }) => {
    const yesterday = new Date(Date.parse(`${TODAY}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
    await start(page, { game: finishedDaily({ daily: yesterday, seed: dailySeed(yesterday) }) })
    const panel = page.getByTestId('daily-outcome')
    await panel.getByRole('button', { name: 'Play today’s Daily' }).click()
    const state = await saved(page)
    expect(state.daily).toBe(TODAY)
    expect(state.seed).toBe(TODAY_SEED)
  })

  test('an open board refetches past the cache once your run has landed (issue 45)', async ({ page }) => {
    const asked = []
    await page.route('**/api/leaderboard**', route => {
      asked.push(new URL(route.request().url()))
      return route.fulfill({
        json: { generatedAt: Date.now(), version: null, seed: TODAY_SEED, daily: TODAY, limit: 25, entries: [], self: null, selfInPage: false },
      })
    })
    await start(page, { game: finishedDaily() })
    await page.getByTestId('daily-outcome').getByRole('button', { name: 'Daily board' }).click()
    // StrictMode in dev mounts the board twice, so count nothing: every
    // request so far goes without the value.
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    expect(asked.every(u => !u.searchParams.has('fresh'))).toBe(true)
    const before = asked.length

    // What historyStore does when the server confirms the run. There is no
    // /api/runs in dev, so the confirmation itself is unit-tested
    // (test/boardFreshness.test.js); this is the board's half.
    await page.evaluate(() => {
      localStorage.setItem('scoundrel:boardFresh', '1794000061000')
      window.dispatchEvent(new Event('scoundrel:board-fresh'))
    })
    await expect.poll(() => asked.length).toBeGreaterThan(before)
    const after = asked[asked.length - 1]
    expect(after.searchParams.get('fresh')).toBe('1794000061000')
    expect(after.searchParams.get('daily')).toBe(TODAY)
  })

  test('run history labels a daily with its day', async ({ page }) => {
    const startedAt = Date.now() - 600_000
    await start(page, {
      records: [{
        v: 1, gameVersion: '0.4', dev: false, id: `run_${startedAt}_d`, runSeed: 'rs_d',
        seed: TODAY_SEED, seedChosen: true, daily: TODAY, accountId: 'guest',
        startedAt, endedAt: startedAt + 300_000, durationMs: 300_000,
        outcome: 'death', sigilsEarned: 2, sigilTarget: 10,
        mode: { id: 'default', name: 'Default' }, ascension: 0,
        boons: [], endingDeck: [], themesFaced: [], bossesDefeated: [], roomsEntered: 8,
      }],
    })
    const entry = page.getByRole('button', { name: /Run history/ })
    if (!(await entry.isVisible())) await page.getByRole('button', { name: 'Home menu' }).click()
    await entry.click()
    await expect(page.getByTestId('history-daily')).toContainText('Daily')
  })
})
