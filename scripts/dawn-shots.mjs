/**
 * Capture screenshots of the current branch for the dawn-run report -- but only
 * of the screens the branch could actually have changed.
 *
 *   npm run dawn:shots                     (against main)
 *   DAWN_SHOTS_OUT=<dir> npm run dawn:shots
 *   npm run dawn:shots -- --base <ref> --out <dir> --all
 *
 * Read by ~/.claude/skills/dawn-run/launch.ps1, which runs this after the
 * unattended session has finished and inlines whatever PNGs land in the out
 * directory into the morning email. The point is that a game change can be
 * judged at breakfast without opening a diff.
 *
 * WHICH screens is the whole design. A fixed set was the first version and it
 * was mostly noise: a night spent on the service worker mailed three pictures
 * of a game that looked exactly like it did yesterday, which trains the eye to
 * skip them. So the diff picks the screens. Every entry in the catalog below
 * declares the source paths that can reach it, and a screen nothing touched is
 * never shot -- if that leaves nothing, this exits without even building.
 *
 * Not a test. It asserts nothing and exits 0 whatever happens, because a
 * missing picture must never be what turns a good night into a failed one.
 *
 * The neighbouring scripts/itch-screenshots.mjs is the authoring tool for the
 * itch.io page: fourteen shots of the standalone build at 2x, chosen to sell
 * the game. This one shoots the web build at 1x and sends at most four,
 * because every byte here rides inside an email.
 */
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, normalize, sep } from 'node:path'
import { chromium } from 'playwright'
import { DESCENT, SAVE_KEY, TUTORIAL_KEY, LAYOUT_KEY } from '../visual/fixtures/descent.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

// DAWN_SHOTS_OUT before --out, because a caller that can set an environment
// variable has already won: `npm run dawn:shots -- --out x` loses its `--` when
// the caller is PowerShell, which eats it as an end-of-parameters marker, and
// npm then swallows `--out` as its own flag instead of forwarding it. The
// launcher sets the variable; the flags stay for running this by hand.
const outDir = process.env.DAWN_SHOTS_OUT || flag('out', join(root, '.dawn-shots'))
const base = process.env.DAWN_SHOTS_BASE || flag('base', 'main')
const shootAll = args.includes('--all')
const skipBuild = args.includes('--no-build')
// Print what would be captured and stop. The catalog below is a claim about
// which files reach which screen, and this is how that claim gets checked
// against a real branch without paying for a build and eight captures.
const planOnly = args.includes('--plan')

// At most four, because the mail has to arrive on a phone. Each capture below
// is 150-350KB and the message carries them base64'd.
const MAX_SHOTS = 4

// 1280x800 at 1x. The height is not a free choice: index.css treats
// max-height 760px as `short:` and clamps the room's cards to phone size under
// it, so a shot at the conventional 720 is a phone layout wearing a desktop
// frame. The scale is 1 rather than the itch set's 2 -- these are read in a
// mail client at a few hundred pixels wide, and 2x would triple the size of a
// message that has to arrive over cellular.
const VIEWPORT = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 754 }

// -- Seeds ---------------------------------------------------------------
//
// Every screen is stated rather than played to, so the set is reproducible:
// playing into a specific room is slow and the deal is random, and a picture
// that changes every time it is taken cannot be compared with yesterday's.
//
// Each one is costed so the screen shows a real decision. The raw DESCENT
// fixture is built for measuring and its weapon outranks the whole room, so
// every card reads "take 0" and the game looks broken rather than tense.
const ROOM = {
  ...DESCENT,
  hp: 9,
  sigilsEarned: 6,
  weapon: { rank: 4, originalRank: 9, lastSlain: null },
  carriedWeapon: { suit: 'D', rank: 4, originalRank: 9 },
}

const KIT = [
  { id: 'k1', suit: 'D', rank: 8 },
  { id: 'k2', suit: 'D', rank: 5 },
  { id: 'k3', suit: 'H', rank: 7 },
  { id: 'k4', suit: 'H', rank: 4 },
  { id: 'k5', suit: 'D', rank: 3 },
  { id: 'k6', suit: 'H', rank: 9 },
]

const SANCTUARY = {
  ...ROOM,
  phase: 'sanctuary',
  hp: 20,
  maxHp: 20,
  boons: ['whetstone', 'quartermaster', 'riposte'],
  boonOffers: [],
  boonChosen: true,
  kit: KIT,
  theme: null,
  themesFaced: ['the_quiet', 'the_crypt', 'the_armory'],
  forgeOpen: false,
  forgeGrants: [],
  forgeChoices: [],
}

// forgeOpen with grants pending is what draws the "Next > Forge" chip, which is
// the part that shows the sanctuary is a sequence rather than one screen.
const BOON_PICK = {
  ...SANCTUARY,
  boons: ['vanguard'],
  boonChosen: false,
  boonOffers: ['whetstone', 'quartermaster', 'riposte'],
  forgeOpen: true,
  forgeGrants: ['inscribe', 'upgrade'],
  forgeGrantIndex: 0,
  forgeChoices: [],
}

const FORGE = {
  ...SANCTUARY,
  forgeOpen: true,
  forgeGrants: ['inscribe', 'upgrade'],
  forgeGrantIndex: 0,
  forgeChoices: [
    { id: 'f1', suit: 'D', rank: 9 },
    { id: 'f2', suit: 'H', rank: 6 },
    { id: 'f3', suit: 'D', rank: 4 },
    { id: 'f4', suit: 'H', rank: 10 },
  ],
}

// Plain monsters on purpose: a trait or boss in the room adds first-encounter
// explainers to the overlay, which crowds the shot and stops the auto-dismiss.
const TRIAL = {
  ...DESCENT,
  hp: 16,
  sigilsEarned: 4,
  theme: 'the_crypt',
  themeChildren: [],
  themeDeckChanges: [],
  weapon: { rank: 7, originalRank: 7, lastSlain: null },
  carriedWeapon: { suit: 'D', rank: 7, originalRank: 7 },
  room: [
    { id: 't1', suit: 'S', rank: 9 },
    { id: 't2', suit: 'C', rank: 6 },
    { id: 't3', suit: 'S', rank: 12 },
    { id: 't4', suit: 'H', rank: 7 },
  ],
}

// The outcome view reads the run record rather than the board, and
// buildRunRecord defaults everything it does not find, so this is all it needs.
const DEATH = {
  phase: 'gameover',
  sigilsEarned: 7,
  sigilTarget: 10,
  mode: 'default',
  ascension: 0,
  boons: ['whetstone', 'quartermaster', 'riposte'],
  kit: KIT,
  themesFaced: ['the_quiet', 'the_crypt', 'the_armory', 'the_menagerie',
                'the_apothecary', 'locust_swarm', 'blood_moon', 'hungry_dark'],
  bossesDefeated: [],
  runRoomsEntered: 34,
  monstersSlain: 51,
  biggestKill: 13,
  weapon: { rank: 8, originalRank: 10 },
  carriedWeapon: null,
  retired: false,
  runStartedAt: Date.now() - 1_140_000,
  log: ['A heavy blow lands in the dark.'],
}

// -- What reaches what ---------------------------------------------------
//
// `when` is the honest half of this file: the paths whose edits can show up on
// that screen. Wrong in the safe direction on purpose -- combat.js is listed
// under the room because it decides the numbers printed on the cards, even
// though most of it never renders. A miss here means a screenshot Joey should
// have seen and did not, which is worse than one he did not need.
//
// Anything under src/ that matches NOTHING still gets the default set (see
// pickScreens), so a new component cannot silently produce a silent night.
const GLOBAL = [
  /^index\.html$/,
  /^src\/(App|main)\.jsx$/,
  /^src\/(index|fonts)\.css$/,
  /^src\/(MobileFitStage|EmbeddedStage|useFitScale|VersionBadge|ErrorBoundary)\./,
  /^src\/games\/scoundrel\/components\/(atoms|modals|SuitIcon|TopBar)\.jsx$/,
  /^(vite|tailwind|postcss)\.config\./,
]

const screens = [
  {
    name: '1-room.png',
    what: 'a room mid-descent',
    phone: true, // also worth seeing at phone width, where the game is played
    when: [
      /components\/(DescentView|cardSlot|cards|HelperIcon|KitModal)\./,
      /logic\/(combat|deck|helpers)\.js$/,
      /scoundrel\/(constants|afflictions|bosses|flags)\.js$/,
    ],
    async go(page) {
      await seed(page, ROOM)
      await page.locator('.card-face').first().waitFor({ timeout: 20_000 })
      await page.getByRole('button', { name: /Bare hands/i }).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '2-sanctuary.png',
    what: 'the sanctuary between descents',
    when: [
      /components\/(SanctuaryView|SanctuaryKitModal|KitModal|library)\./,
      /logic\/(sanctuary|lifecycle)\.js$/,
      /scoundrel\/ascensions\.js$/,
    ],
    async go(page) {
      await seed(page, SANCTUARY)
      await page.getByRole('heading', { name: 'Sanctuary' }).waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '3-forge.png',
    what: 'the Forge, inscribing a tool into the kit',
    when: [/components\/forge\./, /logic\/sanctuary\.js$/],
    async go(page) {
      await seed(page, FORGE)
      await page.getByText(/The Forge . edit 1 of 2/i).waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '4-boon.png',
    what: 'picking a Boon, with the Forge queued behind it',
    when: [/components\/boons\./, /scoundrel\/boons\.js$/],
    async go(page) {
      await seed(page, BOON_PICK)
      await page.getByRole('heading', { name: 'Pick one Boon' }).waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '5-trial.png',
    what: 'the Trial named on arrival',
    when: [/scoundrel\/themes\.js$/],
    async go(page) {
      await seed(page, TRIAL)
      // The overlay auto-dismisses after ~4.2s, so this shot is a race the
      // capture has to win. The board header names the Trial too, so .first().
      await page.getByRole('heading', { name: 'The Crypt' }).first().waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '6-death.png',
    what: 'the run summary after a death',
    when: [
      /components\/(OutcomeView|RunSummary|HistoryModal)\./,
      /scoundrel\/(history|analyticsEvents)\.js$/,
      /logic\/lifecycle\.js$/,
    ],
    async go(page) {
      await seed(page, DEATH)
      await page.getByText(/You fall in the dark/i).waitFor({ timeout: 20_000 })
    },
  },
  {
    name: '7-rules.png',
    what: 'how to play',
    when: [/components\/rules\./],
    async go(page) {
      await openMenu(page)
      await menu(page).getByRole('button', { name: 'How to play' }).click()
      await page.getByRole('heading', { name: /how to play|the deck|rules/i })
        .first().waitFor({ timeout: 10_000 })
    },
  },
  {
    name: '8-home.png',
    what: 'the home menu',
    when: [/components\/(HomeView|modes|LoginModal|FeedbackModal)\./, /scoundrel\/settings\.js$/],
    async go(page) {
      await openMenu(page)
      await menu(page).getByRole('button', { name: 'How to play' }).waitFor({ timeout: 10_000 })
    },
  },
]

// The default set, for a source change that reaches nothing named above.
const DEFAULT_SET = ['1-room.png', '2-sanctuary.png']

// The top bar carries its own rules entry, so an unscoped role query matches
// twice once the overlay is open. The overlay's nav is the disambiguator.
const menu = page => page.locator('nav')

async function openMenu(page) {
  await seed(page, ROOM)
  await page.locator('.card-face').first().waitFor({ timeout: 20_000 })
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Home menu' }).click()
}

async function seed(page, state) {
  await page.addInitScript(({ saveKey, tutorialKey, layoutKey, state }) => {
    localStorage.setItem(tutorialKey, 'true')
    localStorage.setItem(layoutKey, 'modern')
    localStorage.setItem(saveKey, JSON.stringify({ version: 1, state }))
  }, { saveKey: SAVE_KEY, tutorialKey: TUTORIAL_KEY, layoutKey: LAYOUT_KEY, state })
  await page.goto(BASE)
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

// -- Selection -----------------------------------------------------------

function changedFiles() {
  // Three dots: what this branch added, not what main did while it worked.
  const r = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root, encoding: 'utf8', shell: false,
  })
  if (r.status !== 0) return null
  return r.stdout.split('\n').map(s => s.trim()).filter(Boolean)
}

const defaults = () => screens.filter(s => DEFAULT_SET.includes(s.name))

function pickScreens(files) {
  if (shootAll || files === null) {
    // No diff to read (run by hand, or git said no): shoot the default set
    // rather than guessing, and let --all mean all.
    return shootAll ? screens : defaults()
  }

  const hit = screens.filter(s => files.some(f => s.when.some(re => re.test(f))))

  // A global file is one that can reach any screen -- the entry point, the
  // stylesheet, the build config. It does NOT mean shoot everything: most
  // edits to those files (a service-worker registration in main.jsx, a plugin
  // in vite.config.js) change no pixel anywhere, and eight pictures of an
  // unchanged game is the noise this selection exists to remove. The two
  // canonical screens stand in for "the app still renders", and anything the
  // diff names specifically is added on top.
  const broad = files.find(f => GLOBAL.some(re => re.test(f)))
  if (broad) {
    console.log(`dawn-shots: ${broad} can reach any screen; taking the canonical set`)
    return [...defaults(), ...hit.filter(s => !DEFAULT_SET.includes(s.name))]
  }

  if (hit.length) return hit

  // Something under src/ moved but nothing above claims it -- most likely a
  // component this catalog has not learned about yet.
  const source = files.filter(f => /^src\//.test(f) || /^public\//.test(f))
  if (source.length) {
    console.log(`dawn-shots: ${source.length} source file(s) reach no known screen; falling back to the default set`)
    return screens.filter(s => DEFAULT_SET.includes(s.name))
  }
  return []
}

const PORT = 5184
// 127.0.0.1 rather than localhost, for the reason itch-screenshots.mjs
// records: on Windows localhost resolves to ::1 first, so a server bound to
// IPv4 can be shadowed by whatever holds the IPv6 address -- which is how a
// shot gets taken of a leftover dev server instead of the build under review.
const HOST = '127.0.0.1'
const BASE = `http://${HOST}:${PORT}/`

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

// -- Run -----------------------------------------------------------------

const files = changedFiles()
const chosen = pickScreens(files)

if (!chosen.length) {
  // The good outcome for a night spent on tests, docs or the service worker.
  // Said out loud because the launcher logs this line, and "no screenshots"
  // should read as an answer rather than as a failure.
  console.log(`dawn-shots: nothing on screen could have changed (${files ? files.length : 0} files, none reaching a screen); no build, no shots`)
  process.exit(0)
}

// Queued as captures rather than screens: the room earns a phone shot too, and
// the cap is on pictures in the mail, not on screens considered.
const queue = []
for (const s of chosen) {
  if (queue.length >= MAX_SHOTS) break
  queue.push({ ...s })
  if (s.phone && queue.length < MAX_SHOTS) {
    queue.push({ ...s, name: s.name.replace(/\.png$/, '-mobile.png'), what: `${s.what}, on a phone`, viewport: PHONE })
  }
}

console.log(`dawn-shots: ${queue.length} capture(s) from ${files ? files.length : 0} changed file(s): ${queue.map(s => s.what).join('; ')}`)

if (planOnly) process.exit(0)

mkdirSync(outDir, { recursive: true })

// The dawn run has usually just built as part of its gates, so an existing
// dist/ is reused when asked. Rebuilding costs the better part of a minute for
// a picture of the same bytes.
if (!skipBuild || !(await exists(join(distDir, 'index.html')))) {
  const built = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true })
  if (built.status !== 0) {
    console.warn('dawn-shots: build failed; no screenshots taken')
    process.exit(0)
  }
}

if (!(await exists(join(distDir, 'index.html')))) {
  console.warn('dawn-shots: no dist/index.html; no screenshots taken')
  process.exit(0)
}

// Serves dist/ with an index.html fallback, which is what vercel.json rewrites
// do in production. No fallback for /api/* -- there is no API here, and a shot
// of a page waiting on a request that will never answer is worse than a shot
// of the page failing the way it fails offline.
const server = createServer(async (req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, BASE).pathname)
  if (pathname.startsWith('/api/')) return void res.writeHead(404).end()
  if (pathname.endsWith('/')) pathname += 'index.html'
  let filePath = normalize(join(distDir, pathname))
  if (!filePath.startsWith(distDir + sep)) return void res.writeHead(403).end()
  if (!(await exists(filePath))) filePath = join(distDir, 'index.html')
  try {
    const body = await readFile(filePath)
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(PORT, HOST, resolve)
})

try {
  const browser = await chromium.launch()
  try {
    for (const shot of queue) {
      const page = await browser.newPage({ viewport: shot.viewport || VIEWPORT })
      try {
        await shot.go(page)
        // Webfonts change the metrics of every screen in this game; capturing
        // before they resolve produces a shot in the fallback face that reads
        // as a regression when it is nothing of the kind.
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400) // let the fade-in transitions settle
        await page.screenshot({ path: join(outDir, shot.name) })
        console.log(`wrote ${shot.name} - ${shot.what}`)
      } catch (err) {
        console.warn(`skipped ${shot.name}: ${err.message.split('\n')[0]}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
} finally {
  await new Promise(resolve => server.close(resolve))
}
