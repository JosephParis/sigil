import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Every audio cue the game registers must actually exist (issue 03).
//
// victory.mp3 and gameover.mp3 were declared in the registry for a long time
// without ever being added, so the win and death screens played silence. Nothing
// surfaced it: Howler's onloaderror sets _scoundrelFailed and every play() call
// then returns early, by design, so a missing file is indistinguishable from a
// muted one.
//
// The paths are parsed out of audio.js rather than hard-coded here, so this
// covers any cue added later too -- the point is to catch the class of bug, not
// the two files that happened to be missing.

const AUDIO_JS = fileURLToPath(new URL('../src/games/scoundrel/audio.js', import.meta.url))

function registeredAudioPaths() {
  const source = readFileSync(AUDIO_JS, 'utf8')
  const paths = [...source.matchAll(/src:\s*'(\/audio\/[^']+)'/g)].map(m => m[1])
  return [...new Set(paths)]
}

test('the registry is non-empty and parseable', () => {
  // Guards the regex above: if audio.js changes shape and this stops matching,
  // every other test here would vacuously pass with an empty list.
  const paths = registeredAudioPaths()
  expect(paths.length).toBeGreaterThanOrEqual(13)
  expect(paths).toContain('/audio/music/gameover.mp3')
  expect(paths).toContain('/audio/music/victory.mp3')
})

test('every registered cue resolves and is real audio', async ({ request }) => {
  const missing = []
  const empty = []

  for (const path of registeredAudioPaths()) {
    const res = await request.get(path)
    if (res.status() !== 200) {
      missing.push(`${path} -> HTTP ${res.status()}`)
      continue
    }
    const body = await res.body()
    // A dev server can answer 200 with the SPA's index.html for an unknown path,
    // so a status check alone would not prove the file exists.
    if (body.length < 1024) empty.push(`${path} -> ${body.length} bytes`)
    else if (body.slice(0, 5).toString('utf8').includes('<')) {
      missing.push(`${path} -> served HTML, not audio`)
    }
  }

  expect(missing, 'registered cues that do not resolve').toEqual([])
  expect(empty, 'registered cues that resolve but are suspiciously small').toEqual([])
})

/**
 * Decode a cue in the browser and return its duration plus a 100ms peak
 * envelope. Done in-page because the browser already has an MP3 decoder and the
 * test runner does not -- the alternative is either a byte-count heuristic,
 * which cannot tell one bell from three, or another dependency.
 *
 * Callers park the tab on robots.txt, not the app: decoding needs only a
 * same-origin page, and the app's page could be reloaded under the test by
 * the dev server ("Execution context was destroyed"), which failed it now
 * and then.
 */
async function analyseCue(page, url) {
  return page.evaluate(async (src) => {
    const bytes = await (await fetch(src)).arrayBuffer()
    const buffer = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes)
    const samples = buffer.getChannelData(0)
    const bucket = Math.round(buffer.sampleRate * 0.1)

    const peaks = []
    for (let i = 0; i < samples.length; i += bucket) {
      let peak = 0
      for (let j = i; j < Math.min(i + bucket, samples.length); j++) {
        const v = Math.abs(samples[j])
        if (v > peak) peak = v
      }
      peaks.push(peak)
    }
    return { duration: buffer.duration, peaks }
  }, url)
}

/** Indices where the level jumps hard enough to read as a fresh strike. */
function onsets(peaks) {
  const loudest = Math.max(...peaks)
  const out = []
  for (let i = 1; i < peaks.length; i++) {
    if (peaks[i] > loudest * 0.35 && peaks[i] > peaks[i - 1] * 2.5) out.push(i)
  }
  return out
}

test('the one-shot cues are a sane length for a screen transition', async ({ page }) => {
  await page.goto('/robots.txt')
  // Long enough to land, short enough not to outstay the outcome screen.
  for (const path of ['/audio/music/victory.mp3', '/audio/music/gameover.mp3']) {
    const { duration } = await analyseCue(page, path)
    expect(duration, `${path} too short`).toBeGreaterThan(4)
    expect(duration, `${path} too long`).toBeLessThan(30)
  }
})

test('the death cue is a single bell, struck once, at the very start', async ({ page }) => {
  // It shipped once as three tolls spread over 18 seconds, which played as a
  // short piece of music you sat through rather than a death sound. It also
  // opened on ~0.3s of the source recording's room tone, so the strike landed
  // late against the screen it punctuates.
  await page.goto('/robots.txt')
  const { duration, peaks } = await analyseCue(page, '/audio/music/gameover.mp3')

  expect(duration, 'a single toll should not run long').toBeLessThan(12)

  const loudest = Math.max(...peaks)
  const loudestAt = peaks.indexOf(loudest)
  expect(loudestAt, 'the strike must be in the first 300ms, not after a fade-up')
    .toBeLessThanOrEqual(2)

  // Only the opening attack; nothing later climbs back up.
  expect(onsets(peaks), 'extra strikes after the first').toEqual([])

  // And it decays from there rather than sustaining like a bed.
  expect(peaks[peaks.length - 1]).toBeLessThan(loudest * 0.1)
})

test('the death cue is requested as the death screen appears', async ({ page }) => {
  // The wiring, end to end: phase -> playMusic -> the cue actually being
  // fetched. Howler builds the Howl (and so loads the file) on first play, so
  // the request is the observable signal that the toll fired -- an autoplay
  // block would stop the sound, but not this.
  const requested = page.waitForRequest(/\/audio\/music\/gameover\.mp3/, { timeout: 15000 })

  await page.addInitScript(() => {
    localStorage.setItem('scoundrel:tutorialCompleted', 'true')
    localStorage.setItem('scoundrel:save', JSON.stringify({
      version: 1,
      state: {
        phase: 'gameover', sigilsEarned: 2, sigilTarget: 5, mode: 'default',
        ascension: 0, boons: [], kit: [], themesFaced: [], bossesDefeated: [],
        weapon: null, carriedWeapon: null, retired: false, log: ['Dark.'],
      },
    }))
  })
  await page.goto('/')
  await page.getByText('You fall in the dark.').waitFor({ timeout: 15000 })
  await requested
})
