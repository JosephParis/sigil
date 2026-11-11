import { useEffect, useState } from 'react'
import { historyStore } from '../../../utils/historyStore'
import { computeLifetimeStats } from '../history'
import { RunSummary, EndingKitSection } from './RunSummary'
import { PlaySeedButton } from './seed'
import { formatDaily } from '../seed'
import { IS_STANDALONE } from '../../../buildTarget.js'

const OUTCOME_LABEL = { victory: 'Victory', death: 'Died', retired: 'Retired' }
const OUTCOME_COLOR = {
  victory: 'text-rune',
  death: 'text-blood',
  retired: 'text-slate-400',
}

function formatDate(ms) {
  if (!ms) return ''
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function StatCell({ label, value }) {
  return (
    <div className="flex flex-col items-center px-2 py-2">
      <span className="text-xl text-parchment leading-none">{value}</span>
      <span className="text-[9px] uppercase tracking-widest text-slate-500 mt-1 text-center">{label}</span>
    </div>
  )
}

function LifetimePanel({ stats }) {
  const best = stats.bestAscensionCleared >= 0 ? stats.bestAscensionCleared : '—'
  return (
    <div className="panel-warm rounded-md border border-stone-800 grid grid-cols-3 sm:grid-cols-6 divide-x divide-stone-800 mb-5">
      <StatCell label="Runs" value={stats.totalRuns} />
      <StatCell label="Wins" value={stats.wins} />
      <StatCell label="Win rate" value={`${stats.winRate}%`} />
      <StatCell label="Best asc." value={best} />
      <StatCell label="Sigils" value={stats.totalSigils} />
      <StatCell label="Most kills" value={stats.mostKills} />
    </div>
  )
}

function RunRow({ record, expanded, onToggle, onPlaySeed }) {
  return (
    <li className="border border-stone-800 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-stone-800/50 transition"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className={`font-display text-sm shrink-0 ${OUTCOME_COLOR[record.outcome] || ''}`}>
            {OUTCOME_LABEL[record.outcome] || record.outcome}
          </span>
          <span className="text-[12px] text-slate-400 shrink-0">
            {record.sigilsEarned}/{record.sigilTarget} sigils
          </span>
          {record.ascension > 0 && (
            <span className="text-[11px] text-slate-500 shrink-0">A{record.ascension}</span>
          )}
          {record.daily && (
            <span className="text-[11px] text-rune shrink-0" data-testid="history-daily">
              Daily · {formatDaily(record.daily)}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">{formatDate(record.endedAt)}</span>
          <span className="text-slate-600 text-xs">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-4 pt-3 border-t border-stone-800/70 bg-stone-900/30">
          {/* Two columns on wider screens so the run details and the ending
              kit sit side by side, surfacing more before any scroll. */}
          <div className="grid gap-5 md:grid-cols-2 items-start">
            <RunSummary record={record} showDeck={false} />
            <EndingKitSection deck={record.endingDeck || []} />
          </div>
          <PlaySeedButton record={record} onPlay={onPlaySeed} />
        </div>
      )}
    </li>
  )
}

export function HistoryModal({ open, onClose, user, onPlaySeed }) {
  const [records, setRecords] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  // Reload whenever the modal opens or the account changes. The store is
  // async so a cloud backend can drop in here unchanged.
  useEffect(() => {
    if (!open) return
    let alive = true
    const accountId = user?.sub || 'guest'
    historyStore.listRuns(accountId).then(rows => {
      if (alive) setRecords(rows)
    })
    return () => { alive = false }
  }, [open, user])

  if (!open) return null

  const stats = records ? computeLifetimeStats(records) : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="panel max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 my-4 sm:my-auto relative shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-stone-800 hover:bg-stone-700 text-parchment text-xl leading-none flex items-center justify-center border border-stone-700"
          aria-label="Close run history"
        >
          ×
        </button>
        <h2 className="font-display text-rune text-2xl mb-1">Run history</h2>
        <p className="text-[12px] text-slate-500 mb-4">
          {/* The "sign in" nudge is only true where there is something to sign
              in to; standalone has no accounts at all (src/buildTarget.js). */}
          {IS_STANDALONE
            ? 'History is saved on this device.'
            : user
              ? `Signed in as ${user.name || user.email}.`
              : 'Playing as guest. Sign in to keep history tied to your account.'}
          {' '}Press <span className="font-mono text-slate-300">Esc</span> or click outside to close.
        </p>

        {records === null ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading…</div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No finished runs yet. Descend, and your runs will be recorded here.
          </div>
        ) : (
          <>
            {stats && <LifetimePanel stats={stats} />}
            <ul className="space-y-2">
              {records.map(r => (
                <RunRow
                  key={r.id}
                  record={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(id => (id === r.id ? null : r.id))}
                  onPlaySeed={onPlaySeed}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
