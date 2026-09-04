// The design docs, checked against the code they describe (issue 23).
//
// DESIGN.md spent months asserting seven sigils, a previewed theme and a
// 44-card deck the player edits, none of which the game has done since the kit
// rework. Nothing caught it, because a stale sentence in a markdown file breaks
// no build. These assertions are that missing alarm: they read the two root
// design docs as text and hold them to the constants and the functions the
// shipped game actually uses.
//
// A failure here is a doc that has drifted, not code that is wrong. Fix the
// prose (or, if the game genuinely changed, fix the prose *and* this file).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SIGIL_TARGET } from '../src/games/scoundrel/constants'
import { buildStartingKit } from '../src/games/scoundrel/logic/deck'
import { rollForgeChoices } from '../src/games/scoundrel/logic/sanctuary'
import { getAscensionEffects } from '../src/games/scoundrel/ascensions'

const read = name => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8')
const readDir = dir => readdirSync(fileURLToPath(new URL(`../${dir}`, import.meta.url)))

const DESIGN = read('DESIGN.md')
const REWORK = read('REWORK.md')
const SANCTUARY = read('src/games/scoundrel/logic/sanctuary.js')
const SCHEMA = read('db/schema.sql')

// Every table any endpoint creates, read off the DDL itself rather than a list
// someone has to remember to extend.
const API_FILES = [
  ...readDir('api').filter(f => f.endsWith('.js')).map(f => `api/${f}`),
  ...readDir('api/_lib').filter(f => f.endsWith('.js')).map(f => `api/_lib/${f}`),
]
const CREATED_TABLES = API_FILES.flatMap(file =>
  [...read(file).matchAll(/create table if not exists\s+(\w+)/g)].map(m => ({ file, table: m[1] })))

// Spelled-out counts, because that is how the docs write them in prose.
const WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve']

describe('which doc describes the current game', () => {
  it('DESIGN.md says it is superseded, in its first screenful', () => {
    const opening = DESIGN.split('\n').slice(0, 25).join('\n')
    expect(opening).toMatch(/superseded/i)
    expect(opening).toContain('REWORK.md')
  })

  it('REWORK.md no longer calls itself an uncommitted proposal', () => {
    const opening = REWORK.split('\n').slice(0, 25).join('\n')
    expect(opening).not.toMatch(/nothing here is committed/i)
    expect(opening).toMatch(/design of record/i)
  })

  it('REWORK.md carries no open decisions', () => {
    // Section 11 was the register of unsettled questions; the kit size cap was
    // the last one, and it is answered. A new entry here means a live design
    // question is on the loose, which is worth its own issue.
    const section = REWORK.split('## 11.')[1].split('## 12.')[0]
    expect(section).toMatch(/none outstanding/i)
  })
})

describe('the escape condition', () => {
  it('is the same number in both docs as in the code', () => {
    const target = WORD[SIGIL_TARGET]
    for (const [name, doc] of [['DESIGN.md', DESIGN], ['REWORK.md', REWORK]]) {
      // Any prose of the form "<number> sigils" must be the real target. This
      // is what caught nothing when SIGIL_TARGET went 7 -> 10.
      //
      // Lines that cite `SIGIL_TARGET` are exempt: those are the corrections
      // themselves, which have to name the old wrong number to retire it.
      const counts = doc.split('\n')
        .filter(line => !line.includes('SIGIL_TARGET'))
        .flatMap(line => [...line.matchAll(/\b([a-z]+)[ -]sigils\b/gi)])
        .map(m => m[1].toLowerCase())
        .filter(w => WORD.includes(w))
      if (name === 'DESIGN.md') {
        // DESIGN.md is the doc that states the escape condition in prose, in
        // several places. Zero matches would mean this check stopped looking.
        expect(counts.length, 'DESIGN.md states a sigil count').toBeGreaterThan(0)
      }
      for (const word of counts) {
        expect(word, `${name} says "${word} sigils"`).toBe(target)
      }
    }
  })
})

describe('the pre-rework mechanics are not presented as current', () => {
  it('the Forge section of DESIGN.md is marked historical', () => {
    const heading = DESIGN.split('\n').find(l => l.startsWith('## 5.'))
    expect(heading).toMatch(/historical/i)
  })

  it('Strike appears only inside a section marked historical', () => {
    // Sections are `## N. ...`; a section is historical if its heading says so.
    const sections = DESIGN.split(/^## /m).slice(1)
    for (const section of sections) {
      const heading = section.split('\n')[0]
      if (/historical/i.test(heading)) continue
      // "Strike" the noun-verb, not "strikes as" or "strike-through".
      expect(section, `section "${heading}" presents Strike as current`)
        .not.toMatch(/\*\*Strike\*\*|\bStrike\b(?! (all|as))/)
    }
  })

  it('nothing claims the player edits the whole deck', () => {
    const sections = DESIGN.split(/^## /m).slice(1)
    for (const section of sections) {
      const heading = section.split('\n')[0]
      if (/historical/i.test(heading)) continue
      expect(section, `section "${heading}" describes whole-deck editing`)
        .not.toMatch(/edits? the (whole|entire) .{0,12}deck/i)
    }
  })
})

describe('REWORK.md matches the kit code it specifies', () => {
  it('the starting kit really is the low ten', () => {
    expect(REWORK).toMatch(/diamonds 2 to 6 and hearts 2 to 6/)
    const kit = buildStartingKit()
    expect(kit).toHaveLength(10)
    expect(kit.filter(c => c.suit === 'D').map(c => c.rank)).toEqual([2, 3, 4, 5, 6])
    expect(kit.filter(c => c.suit === 'H').map(c => c.rank)).toEqual([2, 3, 4, 5, 6])
  })

  it('the documented Inscribe rank cap is the one the Forge uses', () => {
    expect(REWORK).toMatch(/cap = 4 \+ sigils earned.{0,40}10/s)
    // Asserted by rolling real choices rather than by matching the source. The
    // expression this used to grep for is one reformat away from failing while
    // the rule it encodes is unchanged -- and a failure here is supposed to
    // mean the doc drifted, not that someone moved a bracket.
    //
    // An rng pinned just under 1 takes the top of every range, so each roll
    // lands on the cap itself: enough to catch it moving in either direction.
    const atCeiling = () => 0.999999
    for (const sigils of [0, 1, 3, 6, 9, 12]) {
      const cap = Math.min(10, 4 + sigils)
      const ranks = rollForgeChoices('inscribe', buildStartingKit(), sigils, atCeiling)
        .map(card => card.rank)
      expect(Math.max(...ranks), `cap at ${sigils} sigils`).toBe(cap)
    }
  })

  it('the documented every-visit Forge cadence is the one the base game runs', () => {
    // REWORK.md has promised a Forge on every return since the kit rework; the
    // A0 default was a hand-written [1..7] and quietly stopped honouring it when
    // SIGIL_TARGET went 7 -> 10 (issue 29). Read the doc, then hold the base
    // game's sigil set to it: every return but the opening visit, and no more.
    expect(REWORK).toMatch(/opens on \*\*every sanctuary visit except the opening one\*\*/)
    const opens = new Set(getAscensionEffects(0).forgeSigils)
    expect(opens.has(0), 'the opening visit has no Forge').toBe(false)
    for (let sigils = 1; sigils < SIGIL_TARGET; sigils += 1) {
      expect(opens.has(sigils), `the Forge opens at ${sigils} sigils`).toBe(true)
    }
    // Nothing beyond the target: the last descent ends the run.
    expect(opens.size).toBe(SIGIL_TARGET - 1)
  })

  it('records that the kit has no size cap, matching a codebase that has none', () => {
    expect(REWORK).toMatch(/no (hard )?cap on kit size|no kit size limit/i)
    // A slot cap would have to be enforced where the kit grows, which is the
    // Inscribe path in sanctuary.js.
    expect(SANCTUARY).not.toMatch(/KIT_(SIZE_)?CAP|MAX_KIT/)
  })
})

describe('db/schema.sql is the readable copy of the DDL in api/', () => {
  it('found the DDL to check against', () => {
    // A rename that stops these regexes matching would otherwise turn every
    // assertion below into a vacuous pass.
    expect(CREATED_TABLES.length).toBeGreaterThan(4)
  })

  it('describes every table an endpoint creates', () => {
    for (const { file, table } of CREATED_TABLES) {
      expect(SCHEMA, `${table}, created in ${file}`)
        .toMatch(new RegExp(`create table if not exists ${table}\\b`))
    }
  })

  it('names each of them, and the owning file, in its header', () => {
    // The header is the first thing a reader sees while debugging production;
    // it said "Four tables" and listed five for a while (issue 36).
    const header = SCHEMA.split('-- ---')[0]
    for (const { file, table } of CREATED_TABLES) {
      expect(header, `${table} in the header list`).toContain(table)
      expect(header, `${file} named as ${table}'s owner`).toContain(file)
    }
  })

  it('counts them correctly', () => {
    const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
      'eight', 'nine', 'ten', 'eleven', 'twelve']
    const stated = SCHEMA.match(/^-- (\w+) tables:/mi)
    expect(stated, 'the header states a table count').toBeTruthy()
    const unique = new Set(CREATED_TABLES.map(t => t.table))
    expect(stated[1].toLowerCase()).toBe(WORDS[unique.size])
  })
})
