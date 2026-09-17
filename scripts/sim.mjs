// CLI for the balance simulator (issue 37).
//
//   npm run sim -- --runs 10000 --policy greedy
//
// Why this goes through vite rather than running `sim/run.js` on node
// directly: `src/games/scoundrel/` imports its own modules without file
// extensions, which vite and vitest resolve and bare node does not
// (ERR_UNSUPPORTED_DIR_IMPORT on `./logic`). Adding extensions across `src/`
// would be a large edit to shipping code for the benefit of a tool that does
// not ship, and issue 37 says not to touch the rules to suit the simulator.
// So the CLI borrows the resolver the app already uses. `vite` is a
// devDependency and `ssrLoadModule` needs no server listening on a port.

import { createServer } from 'vite'

const USAGE = `
Usage: npm run sim -- [options]

  --runs <n>       how many runs to simulate        (default 1000)
  --policy <name>  greedy | random                  (default greedy)
  --seed <n>       first seed; the batch is consecutive from here (default 1)
  --json           print the report as JSON instead of a table
  --write-baseline overwrite sim/baseline.json with this batch
  --help
`

function parseArgs(argv) {
  const opts = { runs: 1000, policy: 'greedy', seed: 1, json: false, writeBaseline: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--write-baseline') opts.writeBaseline = true
    else if (arg === '--runs') opts.runs = Number(argv[++i])
    else if (arg === '--policy') opts.policy = argv[++i]
    else if (arg === '--seed') opts.seed = Number(argv[++i])
    else {
      console.error(`Unknown option: ${arg}`)
      console.error(USAGE)
      process.exit(2)
    }
  }
  return opts
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  console.log(USAGE)
  process.exit(0)
}
if (!Number.isFinite(opts.runs) || opts.runs < 1) {
  console.error(`--runs must be a positive number, got ${opts.runs}`)
  process.exit(2)
}
if (!Number.isFinite(opts.seed)) {
  console.error(`--seed must be a number, got ${opts.seed}`)
  process.exit(2)
}

// `middlewareMode` keeps this off a port entirely, so a simulation can never
// collide with a dev server someone left running.
const server = await createServer({
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { simulateBatch } = await server.ssrLoadModule('/sim/run.js')
  const { POLICIES } = await server.ssrLoadModule('/sim/policies.js')
  const { buildReport, formatReport } = await server.ssrLoadModule('/sim/report.js')

  const policy = POLICIES[opts.policy]
  if (!policy) {
    console.error(`Unknown policy "${opts.policy}". Known: ${Object.keys(POLICIES).join(', ')}`)
    process.exit(2)
  }

  const startedAt = Date.now()
  const records = simulateBatch({ runs: opts.runs, seed: opts.seed, policy })
  const elapsedMs = Date.now() - startedAt

  const report = buildReport(records, { policy: opts.policy, seed: opts.seed })

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatReport(report))
    console.log(`${opts.runs} runs in ${(elapsedMs / 1000).toFixed(1)}s`)
  }

  if (opts.writeBaseline) {
    const { writeFile } = await import('node:fs/promises')
    // The baseline stores the report, not the records: it is an expectation
    // about the curve, and ten thousand records would be a large file nobody
    // reads. `generated` is informational; the seed range is what reproduces it.
    const baseline = { ...report, generated: new Date().toISOString().slice(0, 10) }
    await writeFile(new URL('../sim/baseline.json', import.meta.url), `${JSON.stringify(baseline, null, 2)}\n`)
    console.log('wrote sim/baseline.json')
  }
} finally {
  await server.close()
}
