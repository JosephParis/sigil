import { test } from '@playwright/test'

// Screenshots land in visual-screens/<SHOT_DIR>/ so two runs (e.g. "after" on
// the current tree, "before" with the change reverted) can be compared by eye.
const DIR = process.env.SHOT_DIR || 'current'
const shot = (name) => `visual-screens/${DIR}/${name}.png`

// Wait for the display font to actually load, then a beat for fade-in
// animations to settle, so screenshots are stable and on-font.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(700)
}

// Seed a finished run straight into the save slot so the death/victory screen
// renders on load, without playing through. Fields buildRunRecord reads are all
// defaulted, so this minimal state is enough. Tutorial flag is set so the app
// doesn't start a curated walkthrough instead.
async function seedOutcome(page, phase, sigilsEarned) {
  await page.addInitScript(({ phase, sigilsEarned }) => {
    const state = {
      phase,
      sigilsEarned,
      sigilTarget: 5,
      mode: 'default',
      ascension: 0,
      boons: ['vanguard'],
      kit: [
        { id: 'k1', suit: 'D', rank: 7 },
        { id: 'k2', suit: 'H', rank: 5 },
        { id: 'k3', suit: 'C', rank: 9 },
        { id: 'k4', suit: 'S', rank: 11 },
        { id: 'k5', suit: 'C', rank: 4 },
      ],
      themesFaced: ['the_quiet'],
      bossesDefeated: [],
      runRoomsEntered: 9,
      monstersSlain: 14,
      biggestKill: 11,
      weapon: { rank: 7, originalRank: 7 },
      carriedWeapon: phase === 'victory' ? { rank: 7, originalRank: 7 } : null,
      retired: false,
      runStartedAt: Date.now() - 540000,
      log: ['A heavy blow lands in the dark.'],
    }
    localStorage.setItem('scoundrel:tutorialCompleted', 'true')
    localStorage.setItem('scoundrel:save', JSON.stringify({ version: 1, state }))
  }, { phase, sigilsEarned })
}

test('sanctuary', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Sanctuary' }).waitFor()
  await settle(page)
  await page.screenshot({ path: shot('sanctuary'), fullPage: true })
})

test('home-menu', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Home menu' }).click()
  await page.getByRole('heading', { name: 'SIGIL' }).waitFor()
  await settle(page)
  await page.screenshot({ path: shot('home-menu'), fullPage: true })
})

// One shot per rules tab. Card library is still parked, so it has no tab here.
test('rules', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'How to play' }).first().click()
  // The inline sanctuary panel carries the same heading, so key off the
  // modal's own close button to know the overlay is up.
  await page.getByRole('button', { name: 'Close rules' }).waitFor()
  await settle(page)
  await page.screenshot({ path: shot('rules-howto'), fullPage: true })

  // The sanctuary has its own "Boons" button, so scope the tabs to the modal.
  const modal = page.locator('.panel', { has: page.getByRole('button', { name: 'Close rules' }) })
  await modal.getByRole('button', { name: 'Boons', exact: true }).click()
  await settle(page)
  await page.screenshot({ path: shot('rules-boons'), fullPage: true })
  await modal.getByRole('button', { name: 'Trials', exact: true }).click()
  await settle(page)
  await page.screenshot({ path: shot('rules-trials'), fullPage: true })
})

// Parked with the Card library entry points in TopBar and HomeView. The modal
// and its content still exist; nothing mounts them.
test.skip('card-library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('menuitem', { name: 'Card library' }).click()
  await page.getByRole('heading', { name: 'Special cards' }).waitFor()
  await settle(page)
  await page.screenshot({ path: shot('card-library'), fullPage: true })
})

test('credits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'More options' }).click()
  await page.getByRole('menuitem', { name: 'Credits' }).click()
  await page.getByRole('heading', { name: 'Credits' }).waitFor()
  await settle(page)
  await page.screenshot({ path: shot('credits'), fullPage: true })
})

test('outcome-death', async ({ page }) => {
  await seedOutcome(page, 'gameover', 2)
  await page.goto('/')
  await page.getByText('You fall in the dark.').waitFor()
  await settle(page)
  await page.screenshot({ path: shot('outcome-death'), fullPage: true })
})

test('outcome-victory', async ({ page }) => {
  await seedOutcome(page, 'victory', 5)
  await page.goto('/')
  await page.getByText('You are blinded by the light').waitFor()
  await settle(page)
  await page.screenshot({ path: shot('outcome-victory'), fullPage: true })
})
