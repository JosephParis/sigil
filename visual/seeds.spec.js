import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'

// Run seeds (issue 38), end to end: the opening visit shows the seed, a
// friend's seed can be typed in or arrive by link, and the same seed opens on
// the same first room in two unrelated page loads.
//
// Storage is set with page.evaluate, not addInitScript, so a reload does not
// put back what the test has since changed (see the README's two traps).

const SEED = 'K7Q2M9XD'

const saved = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.state ?? null, SAVE_KEY)

// A card as the player sees it; ids carry a timestamp and are only labels.
const roomFaces = state => state.room.map(c => {
  const { id: _id, ...rest } = c
  return JSON.stringify(rest)
})

async function freshOpening(page, query = '') {
  await page.goto('/')
  await page.evaluate(([saveKey, tutorialKey]) => {
    localStorage.clear()
    localStorage.setItem(tutorialKey, 'true')
    localStorage.removeItem(saveKey)
  }, [SAVE_KEY, TUTORIAL_KEY])
  await page.goto(`/${query}`)
  await page.getByRole('button', { name: 'Home menu' }).waitFor()
}

test.describe('run seeds', () => {
  test('the opening visit shows a seed, and a typed seed replaces it', async ({ page }) => {
    await freshOpening(page)
    const shown = page.getByTestId('opening-seed')
    await expect(shown).toHaveText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect((await saved(page)).seedChosen).toBe(false)

    await page.getByRole('button', { name: "Play a friend's seed" }).click()
    await page.getByLabel('Seed to play').fill('k7q2 m9xd')
    await page.getByRole('button', { name: 'Play it' }).click()

    await expect(shown).toHaveText('K7Q2-M9XD')
    const state = await saved(page)
    expect(state.seed).toBe(SEED)
    expect(state.seedChosen).toBe(true)
  })

  test('a code that cannot be a seed is refused with a reason', async ({ page }) => {
    await freshOpening(page)
    const before = (await saved(page)).seed
    await page.getByRole('button', { name: "Play a friend's seed" }).click()
    await page.getByLabel('Seed to play').fill('nope')
    await page.getByRole('button', { name: 'Play it' }).click()
    await expect(page.getByRole('alert')).toContainText('8 letters and numbers')
    expect((await saved(page)).seed).toBe(before)
  })

  test('a shared link opens that seed, past the tutorial, and leaves the address bar', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/?seed=K7Q2-M9XD&v=0.4')
    await page.getByRole('button', { name: 'Home menu' }).waitFor()

    await expect(page.getByTestId('opening-seed')).toHaveText('K7Q2-M9XD')
    const state = await saved(page)
    expect(state.tutorial).toBe(false)
    expect(state.seedChosen).toBe(true)
    expect(new URL(page.url()).search).toBe('')
  })

  test('the same seed opens on the same first room in two page loads', async ({ page }) => {
    const rooms = []
    for (let i = 0; i < 2; i++) {
      await freshOpening(page, `?seed=${SEED}`)
      await page.getByRole('button', { name: 'Descend' }).click()
      await expect.poll(async () => (await saved(page))?.phase).toBe('descent')
      rooms.push(roomFaces(await saved(page)))
    }
    expect(rooms[0].length).toBeGreaterThan(0)
    expect(rooms[1]).toEqual(rooms[0])
  })

  test('a link never throws away a run in progress', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(({ saveKey, tutorialKey, state }) => {
      localStorage.setItem(tutorialKey, 'true')
      localStorage.setItem(saveKey, JSON.stringify({ version: 1, state }))
    }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, state: DESCENT })
    await page.goto(`/?seed=${SEED}`)
    await page.getByRole('button', { name: 'Home menu' }).waitFor()

    await expect(page.getByTestId('seed-notice')).toContainText('run in progress')
    expect((await saved(page)).phase).toBe('descent')
  })

  test('a seed from another version says it will not match', async ({ page }) => {
    await freshOpening(page, `?seed=${SEED}&v=0.0`)
    await expect(page.getByTestId('seed-notice')).toContainText('will not match')
    await expect(page.getByTestId('opening-seed')).toHaveText('K7Q2-M9XD')
    // Read once the run moves on: the descent has no room to spare for it.
    await page.getByRole('button', { name: 'Descend' }).click()
    await expect(page.getByTestId('seed-notice')).toHaveCount(0)
  })

  test('the pause menu shows the seed once the run is under way', async ({ page }) => {
    await freshOpening(page, `?seed=${SEED}`)
    await page.getByRole('button', { name: 'Descend' }).click()
    await page.getByRole('button', { name: 'Home menu' }).click()
    await expect(page.getByTestId('run-seed')).toHaveText('K7Q2-M9XD')
  })
})
