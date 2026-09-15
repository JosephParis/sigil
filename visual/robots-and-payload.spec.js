import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/**
 * robots.txt (issue 19) and the shipped audio payload (issue 16).
 *
 * Both are about what a stranger's browser fetches, which is why they sit
 * together: one controls what crawlers are told, the other controls how many
 * megabytes a first visit costs.
 */

const AUDIO_JS = fileURLToPath(new URL('../src/games/scoundrel/audio.js', import.meta.url))
const AUDIO_DIR = fileURLToPath(new URL('../public/audio', import.meta.url))

test.describe('robots.txt', () => {
  test('is a real file, not the SPA fallback', async ({ request }) => {
    // vercel.json rewrites everything outside /api/* to index.html, so a missing
    // robots.txt answers 200 with the whole game page. A status check alone
    // passes in that state -- which is exactly how this went unnoticed. Assert
    // on the body.
    const res = await request.get('/robots.txt')
    expect(res.status()).toBe(200)

    const body = await res.text()
    expect(body, 'served the SPA HTML instead of robots.txt').not.toContain('<!doctype html')
    expect(body).toMatch(/^\s*(#|User-agent:)/im)
  })

  test('disallows /admin', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text()
    expect(body).toMatch(/^User-agent:\s*\*/im)
    expect(body).toMatch(/^Disallow:\s*\/admin\s*$/im)
  })

  test('does not accidentally block the whole game', async ({ request }) => {
    // `Disallow: /` is a deliberate choice (see the file's comment), not
    // something that should arrive by a stray edit. If it is ever wanted, this
    // test is the place to record the flip.
    const body = await (await request.get('/robots.txt')).text()
    const rules = body.split('\n').filter(l => /^\s*Disallow:/i.test(l)).map(l => l.trim())
    expect(rules, 'game route blocked from indexing').not.toContain('Disallow: /')
  })
})

test.describe('admin route', () => {
  test('sets noindex when it renders', async ({ page }) => {
    // robots.txt is advisory and only reaches crawlers that fetch it first. A
    // crawler following a direct link needs the meta tag.
    await page.goto('/admin')
    const robots = page.locator('meta[name="robots"]')
    await expect(robots).toHaveCount(1)
    expect(await robots.getAttribute('content')).toMatch(/noindex/i)
  })

  test('the game itself is not marked noindex', async ({ page }) => {
    // The tag is injected by AdminDashboard on mount and removed on unmount, so
    // it must not leak onto the game.
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  })
})

test.describe('audio payload', () => {
  /** Every audio file present on disk, with its size. */
  function shippedAudio() {
    const out = []
    for (const dir of readdirSync(AUDIO_DIR)) {
      const full = join(AUDIO_DIR, dir)
      if (!statSync(full).isDirectory()) continue
      for (const f of readdirSync(full)) {
        if (!/\.(mp3|ogg|wav|m4a)$/i.test(f)) continue
        out.push({ name: f, path: `/audio/${dir}/${f}`, bytes: statSync(join(full, f)).size })
      }
    }
    return out
  }

  const registered = () => {
    const source = readFileSync(AUDIO_JS, 'utf8')
    return new Set([...source.matchAll(/src:\s*'(\/audio\/[^']+)'/g)].map(m => m[1]))
  }

  test('ships no audio file the game never plays', async () => {
    // 16MB of unreferenced audio was being deployed: two byte-identical copies
    // of tracks that were already shipping under their in-game names, plus an
    // unused alternative. Nothing failed, because nothing looks at what is in
    // the directory -- only at what the registry names.
    const wanted = registered()
    const orphans = shippedAudio().filter(f => !wanted.has(f.path))
    expect(orphans.map(o => `${o.path} (${(o.bytes / 1048576).toFixed(1)}MB)`)).toEqual([])
  })

  test('no two shipped files are byte-identical', async () => {
    // The duplicates were the bulk of the waste and are invisible by name:
    // dark-times.mp3 and descent.mp3 were the same recording under two titles.
    const { createHash } = await import('node:crypto')
    const byHash = new Map()
    for (const f of shippedAudio()) {
      const h = createHash('md5').update(readFileSync(join(AUDIO_DIR, ...f.path.split('/').slice(2)))).digest('hex')
      byHash.set(h, [...(byHash.get(h) || []), f.name])
    }
    const dupes = [...byHash.values()].filter(names => names.length > 1)
    expect(dupes).toEqual([])
  })

  test('the total payload stays within a sane first-visit budget', async () => {
    // A ceiling, not a target. Audio is lazy-loaded per cue rather than up
    // front, but the directory is still what a determined visit pulls down, and
    // it grew to 32MB without anyone noticing.
    //
    // 20MB until issue 32 brought the two music beds to the same 96 kb/s mono
    // the cues already used, which took the directory from 16MB to 5.5MB. The
    // ceiling moves down with it, because a ceiling left far above the real
    // figure cannot catch the next bed arriving at 320 kb/s.
    const total = shippedAudio().reduce((n, f) => n + f.bytes, 0)
    expect(total / 1048576, 'total audio MB').toBeLessThan(8)
  })

  /**
   * Read the first MPEG audio frame header and report its bitrate, sample rate
   * and channel count.
   *
   * Every shipped file opens with an ID3v2 tag, so skip that first -- its size
   * is a syncsafe integer at bytes 6..9, meaning seven bits per byte. Then scan
   * for the 11-set-bit frame sync. The header's four bitrate bits index a table
   * that depends on MPEG version and layer; all of these are MPEG-1 Layer III,
   * and anything else fails the version assertion rather than being decoded
   * against the wrong table.
   */
  function firstFrame(bytes) {
    let i = 0
    if (bytes.slice(0, 3).toString('latin1') === 'ID3') {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
      i = 10 + size
    }
    for (; i < bytes.length - 4; i++) {
      if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue
      const version = (bytes[i + 1] >> 3) & 0x03 // 3 = MPEG-1
      const layer = (bytes[i + 1] >> 1) & 0x03 // 1 = Layer III
      if (version !== 3 || layer !== 1) continue
      const rates = [null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null]
      const kbps = rates[(bytes[i + 2] >> 4) & 0x0f]
      const hz = [44100, 48000, 32000, null][(bytes[i + 2] >> 2) & 0x03]
      const mode = (bytes[i + 3] >> 6) & 0x03 // 3 = single channel
      if (kbps == null || hz == null) continue
      return { kbps, hz, channels: mode === 3 ? 1 : 2 }
    }
    return null
  }

  test('every music track is 96 kb/s mono at 44.1 kHz', async () => {
    // The house standard, and the thing that actually holds the budget above.
    // The two beds arrived at 320 and 256 kb/s stereo and stayed there through
    // two payload passes, because nothing in the repo could tell the difference
    // between a bed and a cue -- only the directory total moved, and it moved
    // slowly enough to look like growth rather than a mistake.
    //
    // music/ only. The nine files in sfx/ are a different population: they came
    // from nine different sources at everything from 32 to 256 kb/s, several of
    // them MPEG-2 rather than MPEG-1, and they are 0.45MB in total. Holding them
    // to one encoding would be a separate change with no payload argument
    // behind it -- see the note in issue 32.
    const wrong = []
    for (const f of shippedAudio().filter(f => f.path.startsWith('/audio/music/'))) {
      const head = readFileSync(join(AUDIO_DIR, ...f.path.split('/').slice(2))).subarray(0, 1 << 20)
      const frame = firstFrame(head)
      if (!frame) { wrong.push(`${f.path} -> no MPEG-1 Layer III frame found`); continue }
      if (frame.kbps !== 96 || frame.hz !== 44100 || frame.channels !== 1) {
        wrong.push(`${f.path} -> ${frame.kbps} kb/s ${frame.channels === 1 ? 'mono' : 'stereo'} ${frame.hz} Hz`)
      }
    }
    expect(wrong, 'music tracks off the 96 kb/s mono 44.1 kHz standard').toEqual([])
  })

  test('no cue carries an embedded cover art stream', async () => {
    // Both beds shipped a 1425x1425 mjpeg in an ID3 APIC frame -- album art,
    // downloaded by every player and displayed by nothing. ffmpeg carries it
    // through a transcode unless -map 0:a drops it, so a future re-encode can
    // reintroduce it without changing anything visible.
    const withArt = []
    for (const f of shippedAudio()) {
      const bytes = readFileSync(join(AUDIO_DIR, ...f.path.split('/').slice(2)))
      if (bytes.slice(0, 3).toString('latin1') !== 'ID3') continue
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
      if (bytes.subarray(10, 10 + size).includes('APIC')) withArt.push(f.path)
    }
    expect(withArt, 'cues shipping embedded artwork').toEqual([])
  })
})
