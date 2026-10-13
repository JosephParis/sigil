import { test, expect } from '@playwright/test'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY } from './fixtures/descent.js'

// Seed challenges (issue 39): a link carries a friend's time, the opening
// visit names it, the end screen says how the run went against it and dares
// the next friend, and the seed board lists everyone on the one seed.
//
// The dev server has no /api, so the seed board is served by page.route.

const SEED = 'K7Q2M9XD'
const MIN = 60 * 1000

// A finished run on SEED: DESCENT dressed as a terminal state. runStartedAt is
// set relative to the page's own clock so the recorded time is known.
async function finishedRun(page, { phase, minutes, challenge }) {
  await page.goto('/')
  await page.evaluate(({ saveKey, tutorialKey, base, phase, minutes, challenge, seed, min }) => {
    localStorage.clear()
    localStorage.setItem(tutorialKey, 'true')
    const state = {
      ...base,
      phase,
      sigilsEarned: phase === 'victory' ? 10 : base.sigilsEarned,
      sigilTarget: 10,
      seed,
      seedChosen: true,
      challenge: challenge ? { ...challenge, seed } : null,
      runStartedAt: Date.now() - minutes * min,
      pausedMs: 0,
      pausedAt: null,
    }
    localStorage.setItem(saveKey, JSON.stringify({ version: 1, state }))
  }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, base: DESCENT, phase, minutes, challenge, seed: SEED, min: MIN })
  await page.reload()
  await page.getByRole('button', { name: 'Home menu' }).waitFor()
}

test.describe('seed challenges', () => {
  test('a challenge link names the time to beat and who set it', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto(`/?seed=K7Q2-M9XD&v=0.4&t=872&by=Cassandra`)
    await page.getByRole('button', { name: 'Home menu' }).waitFor()

    await expect(page.getByTestId('challenge-target')).toHaveText('Beat Cassandra’s 14:32 on this seed.')
    expect(new URL(page.url()).search).toBe('')
  })

  test('typing a different seed drops the challenge', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto(`/?seed=K7Q2-M9XD&t=872&by=Cassandra`)
    await page.getByRole('button', { name: 'Home menu' }).waitFor()
    await page.getByRole('button', { name: "Play a friend's seed" }).click()
    await page.getByLabel('Seed to play').fill('ZZZZ-0000')
    await page.getByRole('button', { name: 'Play it' }).click()
    await expect(page.getByTestId('challenge-target')).toHaveCount(0)
  })

  test('a win on an entered seed says which board it is listed on', async ({ page }) => {
    await finishedRun(page, { phase: 'victory', minutes: 12, challenge: null })
    await expect(page.getByText(/This victory is listed on the seed board/)).toBeVisible()
  })

  test('a faster win says by how much', async ({ page }) => {
    await finishedRun(page, { phase: 'victory', minutes: 12, challenge: { durationMs: 14 * MIN + 32000, by: 'Cassandra' } })
    // The clock runs between writing the save and the screen drawing it, so
    // allow a few seconds either way rather than pinning the last digit.
    await expect(page.getByTestId('challenge-verdict')).toHaveText(/^You beat Cassandra’s 14:32 by 2:[23]\d\.$/)
  })

  test('a slower win says who still holds it', async ({ page }) => {
    await finishedRun(page, { phase: 'victory', minutes: 20, challenge: { durationMs: 14 * MIN, by: 'Cassandra' } })
    await expect(page.getByTestId('challenge-verdict')).toHaveText(/^Cassandra still holds it: 14:00 to your 20:0\d\.$/)
  })

  test('a death leaves the time standing, and offers no dare', async ({ page }) => {
    await finishedRun(page, { phase: 'gameover', minutes: 5, challenge: { durationMs: 14 * MIN, by: null } })
    await expect(page.getByTestId('challenge-verdict')).toHaveText('your friend’s 14:00 stands. The seed is still there.')
    await expect(page.getByRole('button', { name: 'Challenge a friend' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Play this seed again' })).toBeVisible()
  })

  test('the dare copies a message with a link carrying the time', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await finishedRun(page, { phase: 'victory', minutes: 12, challenge: null })
    // Desktop Chromium has no share sheet here, so this exercises the clipboard
    // path; force it in case a future runner grows one.
    await page.evaluate(() => { delete navigator.share; navigator.share = undefined })
    await page.getByRole('button', { name: 'Challenge a friend' }).click()
    await expect(page.getByRole('button', { name: 'Challenge copied' })).toBeVisible()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/^I escaped Sigil in 12:0\d on seed K7Q2-M9XD\. Can you beat it\? http/)
    const url = new URL(copied.slice(copied.indexOf('http')))
    expect(url.searchParams.get('seed')).toBe('K7Q2-M9XD')
    expect(Number(url.searchParams.get('t'))).toBeGreaterThanOrEqual(720)
    expect(url.searchParams.get('by')).toBeTruthy()
  })

  test('playing the seed again keeps the seed and the friend’s time', async ({ page }) => {
    await finishedRun(page, { phase: 'gameover', minutes: 5, challenge: { durationMs: 14 * MIN + 32000, by: 'Cassandra' } })
    await page.getByRole('button', { name: 'Play this seed again' }).click()
    await expect(page.getByTestId('opening-seed')).toHaveText('K7Q2-M9XD')
    await expect(page.getByTestId('challenge-target')).toHaveText('Beat Cassandra’s 14:32 on this seed.')
  })

  test('the seed board asks for this seed and lists who escaped it', async ({ page }) => {
    const asked = []
    await page.route('**/api/leaderboard**', route => {
      asked.push(new URL(route.request().url()).searchParams.get('seed'))
      return route.fulfill({
        json: {
          seed: SEED, limit: 25, self: null, selfInPage: false,
          entries: [
            { rank: 1, playerName: 'Cassandra', ascension: 0, sigilsEarned: 10, durationMs: 872000, endedAt: Date.now(), mode: 'default', gameVersion: '0.4', you: false },
          ],
        },
      })
    })
    await finishedRun(page, { phase: 'victory', minutes: 12, challenge: null })
    await page.getByRole('button', { name: 'Seed board' }).click()

    await expect(page.getByRole('heading', { name: /Seed K7Q2-M9XD/ })).toBeVisible()
    await expect(page.getByText('Cassandra')).toBeVisible()
    await expect(page.getByText('14:32')).toBeVisible()
    expect(asked).toContain(SEED)

    // Closing it puts the main board back: the next open must not be stuck on the seed.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Home menu' }).click()
    await page.getByRole('button', { name: /^Leaderboard/ }).click()
    await expect(page.getByRole('heading', { name: 'Fastest descents' })).toBeVisible()
    expect(asked.at(-1)).toBeNull()
  })
})
