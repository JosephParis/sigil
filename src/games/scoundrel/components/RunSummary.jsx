import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CardSuitFan } from './forge'
import { BoonName } from './boons'
import { BOONS, THEMES, getTheme } from '../logic'
import { SeedLine } from './seed'

// Presentational view of one stored run record. Reused by the end-of-run
// screen (OutcomeView) and the expanded row in the history modal. Mechanical
// copy only: no flavor in any static string.

const OUTCOME_LABEL = {
  victory: 'Victory',
  death: 'Died',
  retired: 'Retired',
}

const OUTCOME_COLOR = {
  victory: 'text-rune',
  death: 'text-blood',
  retired: 'text-slate-400',
}

function formatDuration(ms) {
  const total = Math.floor((ms || 0) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m <= 0) return `${s}s`
  return `${m}m ${s}s`
}

// Inline list with a rune separator between entries, e.g. "A ✦ B ✦ C".
function RuneList({ items }) {
  if (!items || items.length === 0) return null
  return (
    <p className="text-[13px] text-slate-300 leading-relaxed">
      {items.map((label, i) => (
        <span key={i}>
          {i > 0 && <span className="text-rune/50 mx-2 select-none">✦</span>}
          {label}
        </span>
      ))}
    </p>
  )
}

// Boon list with tooltips - looks up boons by name or id
function BoonList({ boons }) {
  if (!boons || boons.length === 0) return null
  return (
    <p className="text-[13px] text-slate-300 leading-relaxed">
      {boons.map((boon, i) => {
        // Support both {id: "..."} and {name: "..."} formats
        const boonId = boon.id || Object.keys(BOONS).find(id => BOONS[id].name === boon.name)
        return (
          <span key={i}>
            {i > 0 && <span className="text-rune/50 mx-2 select-none">✦</span>}
            {boonId ? <BoonName boonId={boonId} /> : boon.name}
          </span>
        )
      })}
    </p>
  )
}

// Theme name with tooltip
function ThemeName({ themeId, className = '' }) {
  const theme = getTheme(themeId)
  const [showTooltip, setShowTooltip] = useState(false)
  const spanRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (showTooltip && spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX
      })
    }
  }, [showTooltip])

  if (!theme) return null

  return (
    <>
      <span
        ref={spanRef}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="cursor-help inline-block"
      >
        <span className={className || 'text-slate-300'}>
          {theme.name}
        </span>
      </span>
      {showTooltip && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999
          }}
          className="w-64 rounded-md border border-rune/40 bg-stone-950/98 p-2.5 text-left shadow-xl pointer-events-none"
        >
          <div className="text-rune font-semibold mb-1">{theme.name}</div>
          <div className="text-[11px] text-slate-300 leading-snug">{theme.description}</div>
        </div>,
        document.body
      )}
    </>
  )
}

// Theme/Trial list with tooltips - looks up themes by name or id
function ThemeList({ themes }) {
  if (!themes || themes.length === 0) return null
  return (
    <p className="text-[13px] text-slate-300 leading-relaxed">
      {themes.map((theme, i) => {
        // Support both {id: "..."} and {name: "..."} formats
        const themeId = theme.id || Object.keys(THEMES).find(id => THEMES[id]?.name === theme.name)
        return (
          <span key={i}>
            {i > 0 && <span className="text-rune/50 mx-2 select-none">✦</span>}
            {themeId ? <ThemeName themeId={themeId} /> : theme.name}
          </span>
        )
      })}
    </p>
  )
}

export function Section({ title, children }) {
  return (
    <div>
      <div className="text-rune text-[10px] font-semibold uppercase tracking-[0.25em] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg text-parchment leading-none whitespace-nowrap">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{label}</span>
    </div>
  )
}

// The run's final kit as a read-only card fan, in the same visual language
// as the in-game "Your kit" view. Exported so the end-of-run screen can place
// it in its own column instead of stacking it under the rest of the summary.
export function EndingKitSection({ deck }) {
  if (!deck || deck.length === 0) return null
  return (
    <Section title={`Ending kit · ${deck.length} cards`}>
      <CardSuitFan cards={deck} readOnly />
    </Section>
  )
}

export function RunSummary({ record, showDeck = true }) {
  if (!record) return null
  const {
    outcome, sigilsEarned, sigilTarget, mode, ascension, ascensionName,
    boons, endingDeck, themesFaced, bossesDefeated,
    roomsEntered, monstersSlain, durationMs, seed, seedChosen, gameVersion,
  } = record

  const deck = endingDeck || []

  const modeItems = [
    mode?.name || 'Default',
    ...(ascension > 0
      ? [ascensionName ? `Ascension ${ascension}: ${ascensionName}` : `Ascension ${ascension}`]
      : []),
  ]

  return (
    <div className="space-y-3 short:space-y-2 sm:space-y-5 text-left">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className={`font-display text-xl ${OUTCOME_COLOR[outcome] || 'text-parchment'}`}>
          {OUTCOME_LABEL[outcome] || outcome}
        </span>
        <span className="text-[11px] uppercase tracking-widest text-slate-500">
          {sigilsEarned} of {sigilTarget} sigils
        </span>
      </div>

      <Section title="Mode">
        <RuneList items={modeItems} />
        <SeedLine seed={seed} version={gameVersion} chosen={seedChosen} />
      </Section>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 py-2 short:py-1 sm:py-3 border-y border-stone-800">
        <Stat label="Rooms" value={roomsEntered || 0} />
        <Stat label="Slain" value={monstersSlain || 0} />
        <Stat label="Time" value={formatDuration(durationMs)} />
      </div>

      {themesFaced?.length > 0 && (
        <Section title="Trials faced">
          <ThemeList themes={themesFaced} />
        </Section>
      )}

      {boons?.length > 0 && (
        <Section title="Boons">
          <BoonList boons={boons} />
        </Section>
      )}

      {bossesDefeated?.length > 0 && (
        <Section title="Bosses defeated">
          <RuneList items={bossesDefeated.map(b => b.name)} />
        </Section>
      )}

      {showDeck && <EndingKitSection deck={deck} />}
    </div>
  )
}
