import { test, expect } from '@playwright/test'

// Functional (non-screenshot) guard for the tutorial. It plays the curated
// walk the way a new player is meant to: at every step it clicks the cue's
// recommended action (the `.tutorial-recommended` card / bare-hands / flee
// button), falling back to any playable card only in the deliberate "no move
// stands out" dead-cue moment.
//
// Two assertions:
//   1. The "learned every move" banner appears at some point. That banner is
//      driven by tutorialAllLessonsDone, so it only shows once ALL seven
//      lessons are marked, including the hard-coded, id-coupled
//      bare-hands-choice lesson (see buildTutorialDeck's tut_d7 / tut_s8 and
//      the override in computeTutorialCue). If that lesson silently stops
//      being steered, the cue never forces the second bare-hand, the banner
//      never shows, and this fails, which is exactly the regression we want
//      to catch.
//   2. The walk ends at the first real sanctuary ("Tutorial complete"), i.e.
//      a win. Before the tail-guidance fix, following imperfectly could end in
//      death; the cue now guides all the way to the exit.

// Run twice: once as-is, once with the OS reduced-motion setting on (issue 17),
// where the cue is a static ring rather than a pulse and every card animation
// collapses to its end state. The walk must still read and still win.
for (const reducedMotion of ['no-preference', 'reduce']) {
test(`tutorial: cue guides every lesson to a win (motion: ${reducedMotion})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion })
  // The walk is ~18 clicked steps with settle waits between each.
  test.setTimeout(120000)
  // Fresh player: without the completed flag, the app starts the curated walk.
  await page.addInitScript(() => {
    try { localStorage.removeItem('scoundrel:tutorialCompleted') } catch { /* ignore */ }
  })
  await page.goto('/')

  // Opening sanctuary -> descend into the walk. Wait for the first cue.
  await page.getByRole('button', { name: 'Descend' }).click()
  await page.locator('.tutorial-recommended').first().waitFor({ timeout: 10000 })

  let sawLessonsDone = false
  let sawBareHandsChoiceCue = false
  let reachedSanctuary = false
  const maxSteps = 45

  for (let i = 0; i < maxSteps; i++) {
    // Win: the first real sanctuary shows the completion beat.
    if (await page.getByText('Tutorial complete').isVisible().catch(() => false)) {
      reachedSanctuary = true
      break
    }
    // Death would drop us on the outcome screen; fail loudly.
    if (await page.getByText('You fall in the dark.').isVisible().catch(() => false)) {
      throw new Error('Player died during the tutorial walk')
    }
    // Record the all-lessons-done banner whenever it is showing.
    if (await page.getByText('learned every move').isVisible().catch(() => false)) {
      sawLessonsDone = true
    }

    // The dead-cue state (only wasteful cards left) shows a distinct banner and
    // no glowing target; play any enabled card to move on. Otherwise click the
    // cue (auto-waits, covering the combat reveal animation).
    const deadCue = await page.getByText('No move stands out').isVisible().catch(() => false)
    if (deadCue) {
      await page.locator('button.card-face:not([disabled])').first().click()
    } else {
      const cue = page.locator('.tutorial-recommended').first()
      // The bare-hands-choice payoff is the ONLY moment the cue glows a
      // "Bare hands" button (a monster the weapon COULD swing, but the lesson
      // is to bare-hand it). Every other bare-hand is a locked monster with no
      // button, or a plain card/flee. Seeing it proves the id-coupled override
      // actually fired; a second bare-hand elsewhere in the tail would still
      // mark the lesson but never light this button.
      const cueText = await cue.innerText({ timeout: 10000 }).catch(() => '')
      if (/bare hands/i.test(cueText)) sawBareHandsChoiceCue = true
      await cue.click({ timeout: 10000 })
    }
    await page.waitForTimeout(400)
  }

  expect(
    sawLessonsDone,
    'the "learned every move" banner should appear, proving all seven lessons were taught'
  ).toBe(true)
  expect(
    sawBareHandsChoiceCue,
    'the cue should light a "Bare hands" button on the swingable 8♠, proving the id-coupled bare-hands-choice override fired (not just that some bare-hand happened in the tail)'
  ).toBe(true)
  expect(
    reachedSanctuary,
    'the walk should end at the first real sanctuary (a win), not a death or a stall'
  ).toBe(true)
  await expect(page.getByText('Tutorial complete')).toBeVisible()
})
}
