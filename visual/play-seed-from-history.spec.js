import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'

// Issue 41: "Play this seed" from run history, and the seed in the desktop
// descent sidebar.
//
// Storage is set with page.evaluate after the first load, not addInitScript,
// so a reload does not put back what the test has since changed.

const SEED = 'K7Q2M9XD'
const HISTORY_KEY = 'scoundrel:history:guest'

const saved = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.state ?? null, SAVE_KEY)

// A finished run as history stores it, cut to what the row reads.
function record({ seed = SEED, gameVersion = '0.4' } = {}) {
  const startedAt = Date.now() - 600_000
  return {
    v: 1, gameVersion, dev: false,
    id: `run_${startedAt}_test`, runSeed: 'rs_test',
    seed, seedChosen: false, accountId: 'guest', playerName: null, deviceId: null,
    startedAt, endedAt: startedAt + 300_000, durationMs: 300_000,
    outcome: 'death', sigilsEarned: 3, sigilTarget: 7,
    mode: { id: 'default', name: 'Default' }, ascension: 0, ascensionName: null,
    boons: [], endingDeck: [], themesFaced: [], bossesDefeated: [],
    roomsEntered: 9, monstersSlain: 12,
  }
}

// Land on the app with the given history and, optionally, a run in the save
// slot. No save means a fresh opening visit, which has nothing to lose.
async function start(page, { records, game = null }) {
  await page.goto('/')
  await page.evaluate(({ saveKey, tutorialKey, historyKey, records, game }) => {
    localStorage.clear()
    localStorage.setItem(tutorialKey, 'true')
    localStorage.setItem(historyKey, JSON.stringify(records))
    if (game) localStorage.setItem(saveKey, JSON.stringify({ version: 1, state: game }))
  }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, historyKey: HISTORY_KEY, records, game })
  await page.goto('/')
  await page.getByRole('button', { name: 'Home menu' }).waitFor()
}

async function openFirstRun(page) {
  // The opening visit already shows the home menu; a descent needs it opened.
  const entry = page.getByRole('button', { name: /Run history/ })
  if (!(await entry.isVisible())) await page.getByRole('button', { name: 'Home menu' }).click()
  await entry.click()
  await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible()
  await page.getByRole('button', { name: /Died/ }).click()
}

test.describe('play a seed from run history', () => {
  test('starts that seed on the opening visit, entered, and closes history', async ({ page }) => {
    await start(page, { records: [record()] })
    const minted = (await saved(page)).seed
    expect(minted).not.toBe(SEED)

    await openFirstRun(page)
    await page.getByRole('button', { name: 'Play this seed' }).click()

    await expect(page.getByRole('heading', { name: 'Run history' })).toHaveCount(0)
    await expect(page.getByTestId('opening-seed')).toHaveText('K7Q2-M9XD')
    const state = await saved(page)
    expect(state.phase).toBe('sanctuary')
    expect(state.sigilsEarned).toBe(0)
    expect(state.seed).toBe(SEED)
    expect(state.seedChosen).toBe(true)
    // Same version: nothing to warn about.
    await expect(page.getByTestId('seed-notice')).toHaveCount(0)
  })

  test('refuses with a run in progress, says why, and leaves the run alone', async ({ page }) => {
    await start(page, { records: [record()], game: DESCENT })
    const before = await saved(page)
    expect(before.phase).toBe('descent')

    await openFirstRun(page)
    await page.getByRole('button', { name: 'Play this seed' }).click()

    await expect(page.getByTestId('play-seed-refusal')).toContainText('run in progress')
    await expect(page.getByRole('heading', { name: 'Run history' })).toBeVisible()
    const after = await saved(page)
    expect(after.phase).toBe('descent')
    expect(after.seed ?? null).toBe(before.seed ?? null)
    expect(after.room).toEqual(before.room)
  })

  test('a record from another version plays, with the version notice', async ({ page }) => {
    await start(page, { records: [record({ gameVersion: '0.0' })] })
    await openFirstRun(page)
    await page.getByRole('button', { name: 'Play this seed' }).click()

    await expect(page.getByTestId('opening-seed')).toHaveText('K7Q2-M9XD')
    await expect(page.getByTestId('seed-notice')).toContainText('will not match')
    await expect(page.getByTestId('seed-notice')).toContainText('0.0')
  })

  test('a record with no seed offers nothing to play', async ({ page }) => {
    await start(page, { records: [record({ seed: null })] })
    await openFirstRun(page)
    await expect(page.getByRole('button', { name: 'Play this seed' })).toHaveCount(0)
  })
})

test.describe('the seed in the descent sidebar', () => {
  async function descendOn(page) {
    await page.goto('/')
    await page.evaluate(([saveKey, tutorialKey]) => {
      localStorage.clear()
      localStorage.setItem(tutorialKey, 'true')
      localStorage.removeItem(saveKey)
    }, [SAVE_KEY, TUTORIAL_KEY])
    await page.goto(`/?seed=${SEED}`)
    await page.getByRole('button', { name: 'Descend' }).click()
    await expect.poll(async () => (await saved(page))?.phase).toBe('descent')
  }

  test('shows on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await descendOn(page)
    expect(await page.evaluate(() => window.innerWidth)).toBeGreaterThanOrEqual(768)
    await expect(page.getByTestId('descent-seed')).toBeVisible()
    await expect(page.getByTestId('descent-seed')).toContainText('K7Q2-M9XD')
    await expect(page.getByTestId('descent-seed')).toContainText('(entered)')
  })

  test('stays off a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await descendOn(page)
    // Assert the environment: below md:, where the sidebar is not drawn.
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThan(768)
    // Rendered, so "hidden" means the layout hid it, not that it never existed.
    await expect(page.getByTestId('descent-seed')).toHaveCount(1)
    await expect(page.getByTestId('descent-seed')).toBeHidden()
  })
})
