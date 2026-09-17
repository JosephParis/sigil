// Aggregation and formatting for the simulator (issue 37).
//
// This module turns a batch of run records into the numbers
// `WINRATE_TARGETS.md` specifies, and nothing else. It does no simulating and
// holds no policy: given the same records it prints the same report, which is
// what lets `sim/baseline.json` be a stored expectation rather than a snapshot
// of a particular afternoon.

// `WINRATE_TARGETS.md:44`.
export const TOTAL_BAND = Object.freeze({ low: 15, high: 25, target: 20 })

// The per-descent survival curve, `WINRATE_TARGETS.md:52-66`. Survival here is
// the *conditional* pass rate the spec asks for in its measurement notes: of
// the runs that entered this descent, the share that left it alive.
export const DESCENT_TARGETS = Object.freeze({
  1: 97, 2: 95, 3: 93, 4: 90, 5: 88, 6: 85, 7: 83, 8: 80, 9: 78, 10: 76,
})

// The per-tier bands, `WINRATE_TARGETS.md:70-81`. A theme is measured against
// the band of the descent it appeared in, so the tier is a property of the
// slot rather than of the theme.
export const TIERS = Object.freeze([
  { tier: 'Quiet', descents: [1], low: 96, high: 98 },
  { tier: 'Tier 1', descents: [2], low: 94, high: 96 },
  { tier: 'Tier 2', descents: [3], low: 92, high: 94 },
  { tier: 'Tier 3', descents: [4, 5], low: 87, high: 90 },
  { tier: 'Tier 4', descents: [6, 7], low: 82, high: 85 },
  { tier: 'Tier 5', descents: [8, 9, 10], low: 75, high: 80 },
])

// `WINRATE_TARGETS.md:83-91`: the tolerance exists so nobody chases noise.
export const TOLERANCE = 3

// `lifecycle.js` patches a descent's timeline entry with `'cleared'`,
// `'died'` or `'retired'`. Surviving is stated as an allowlist rather than
// "not died", because an unfinished leg carries `outcome: null`
// (`lifecycle.js:297`) and counting that as survival is how a broken report
// prints 100%.
export function survivedLeg(leg) {
  return leg.outcome === 'cleared' || leg.outcome === 'retired'
}

export function tierOf(descent) {
  return TIERS.find(t => t.descents.includes(descent)) || null
}

// Where a measured survival sits relative to a band. The three words are the
// decision rule's own vocabulary, so a report line reads as the action to take.
export function verdictFor(survival, band) {
  if (survival === null) return 'no-data'
  if (survival < band.low - TOLERANCE) return 'below'
  if (survival > band.high + TOLERANCE) return 'above'
  if (survival < band.low || survival > band.high) return 'tolerance'
  return 'in'
}

function pct(n, d) {
  return d === 0 ? null : round1((n / d) * 100)
}

function round1(n) {
  return Math.round(n * 10) / 10
}

// The whole report as data. `formatReport` is the only part that knows about
// terminals, so the same numbers serialise into `sim/baseline.json`.
export function buildReport(records, meta = {}) {
  const runs = records.length
  const wins = records.filter(r => r.won).length

  // Conditional survival per descent: entered vs cleared. A record's
  // `descents` array carries one entry per descent actually begun, so entering
  // is simply appearing there.
  const perDescent = {}
  for (const record of records) {
    for (const leg of record.descents) {
      const slot = (perDescent[leg.descent] ||= { entered: 0, cleared: 0 })
      slot.entered += 1
      if (survivedLeg(leg)) slot.cleared += 1
    }
  }

  const descentRows = Object.keys(perDescent)
    .map(Number)
    .sort((a, b) => a - b)
    .map(descent => {
      const { entered, cleared } = perDescent[descent]
      const survival = pct(cleared, entered)
      const target = DESCENT_TARGETS[descent] ?? null
      return {
        descent,
        entered,
        cleared,
        survival,
        target,
        delta: survival === null || target === null ? null : round1(survival - target),
      }
    })

  // Per theme, split by the tier of the descent it appeared in. The same theme
  // can be drawn in two slots and is a separate measurement in each, because
  // the band it answers to is the slot's.
  const perTheme = {}
  for (const record of records) {
    for (const leg of record.descents) {
      const tier = tierOf(leg.descent)
      if (!tier) continue
      for (const themeId of leg.themes) {
        const key = `${themeId}@${tier.tier}`
        const slot = (perTheme[key] ||= {
          themeId, tier: tier.tier, low: tier.low, high: tier.high, entered: 0, cleared: 0,
        })
        slot.entered += 1
        if (survivedLeg(leg)) slot.cleared += 1
      }
    }
  }

  const themeRows = Object.values(perTheme)
    .map(row => {
      const survival = pct(row.cleared, row.entered)
      return { ...row, survival, verdict: verdictFor(survival, row) }
    })
    .sort((a, b) => (a.tier === b.tier
      ? (a.survival ?? 0) - (b.survival ?? 0)
      : TIERS.findIndex(t => t.tier === a.tier) - TIERS.findIndex(t => t.tier === b.tier)))

  const deaths = {}
  for (const record of records) {
    if (!record.won) deaths[record.deathSource || 'unknown'] = (deaths[record.deathSource || 'unknown'] || 0) + 1
  }

  const forgeVisits = records.map(r => r.forgeVisits)
  const totalWinrate = pct(wins, runs)

  return {
    meta: { runs, ...meta },
    total: {
      wins,
      winrate: totalWinrate,
      band: TOTAL_BAND,
      verdict: verdictFor(totalWinrate, TOTAL_BAND),
    },
    descents: descentRows,
    themes: themeRows,
    deaths,
    forge: {
      mean: runs === 0 ? null : round1(forgeVisits.reduce((a, b) => a + b, 0) / runs),
      min: runs === 0 ? null : Math.min(...forgeVisits),
      max: runs === 0 ? null : Math.max(...forgeVisits),
    },
    reached: {
      mean: runs === 0 ? null : round1(records.reduce((a, r) => a + r.reached, 0) / runs),
      max: runs === 0 ? null : Math.max(...records.map(r => r.reached)),
    },
    steps: {
      mean: runs === 0 ? null : round1(records.reduce((a, r) => a + r.steps, 0) / runs),
    },
  }
}

const VERDICT_LABEL = {
  in: 'in band',
  tolerance: `within ${TOLERANCE}pt tolerance`,
  below: 'BELOW band - too punishing for the slot',
  above: 'ABOVE band - too soft for the slot',
  'no-data': 'no data',
}

function show(n, suffix = '%') {
  return n === null ? '--' : `${n}${suffix}`
}

function pad(s, width) {
  return String(s).padEnd(width)
}

function padStart(s, width) {
  return String(s).padStart(width)
}

export function formatReport(report) {
  const lines = []
  const { meta, total } = report

  lines.push('')
  lines.push(`Sigil balance simulation - ${meta.runs} runs, policy "${meta.policy}", seeds ${meta.seed}-${meta.seed + meta.runs - 1}`)
  lines.push(`Reference population: default mode, Ascension 0, tutorial off (WINRATE_TARGETS.md:46-48)`)
  lines.push('')

  lines.push(`TOTAL WINRATE  ${show(total.winrate)}  (${total.wins}/${meta.runs})`)
  lines.push(`  target ${TOTAL_BAND.target}%, band ${TOTAL_BAND.low}-${TOTAL_BAND.high}%  ->  ${VERDICT_LABEL[total.verdict]}`)
  lines.push('')

  lines.push('SURVIVAL PER DESCENT (conditional: of those that entered)')
  lines.push(`  ${pad('#', 4)}${pad('tier', 8)}${padStart('entered', 8)}${padStart('survived', 10)}${padStart('target', 8)}${padStart('delta', 8)}`)
  for (const row of report.descents) {
    const tier = tierOf(row.descent)
    lines.push(`  ${pad(row.descent, 4)}${pad(tier ? tier.tier : '?', 8)}${padStart(row.entered, 8)}${padStart(show(row.survival), 10)}${padStart(show(row.target), 8)}${padStart(row.delta === null ? '--' : `${row.delta > 0 ? '+' : ''}${row.delta}`, 8)}`)
  }
  lines.push('')

  lines.push('SURVIVAL PER THEME, against its tier band')
  let currentTier = null
  for (const row of report.themes) {
    if (row.tier !== currentTier) {
      currentTier = row.tier
      lines.push(`  ${currentTier} (band ${row.low}-${row.high}%)`)
    }
    lines.push(`    ${pad(row.themeId, 22)}${padStart(show(row.survival), 8)}${padStart(`n=${row.entered}`, 9)}  ${VERDICT_LABEL[row.verdict]}`)
  }
  lines.push('')

  lines.push('DEATHS BY CAUSE')
  const deathEntries = Object.entries(report.deaths).sort((a, b) => b[1] - a[1])
  if (deathEntries.length === 0) lines.push('  none - every run won')
  for (const [cause, count] of deathEntries) {
    lines.push(`    ${pad(cause, 22)}${padStart(count, 8)}${padStart(show(pct(count, meta.runs)), 8)}`)
  }
  lines.push('')

  lines.push(`FORGE VISITS PER RUN  mean ${show(report.forge.mean, '')}  min ${show(report.forge.min, '')}  max ${show(report.forge.max, '')}`)
  lines.push(`  a full run at Ascension 0 should see SIGIL_TARGET - 1 visits (issue 29)`)
  lines.push(`DESCENTS REACHED      mean ${show(report.reached.mean, '')}  max ${show(report.reached.max, '')}`)
  lines.push(`ACTIONS PER RUN       mean ${show(report.steps.mean, '')}`)
  lines.push('')

  return lines.join('\n')
}
