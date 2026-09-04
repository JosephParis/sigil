// The /api/stats handler (issue 33).
//
// This is how batch 1 gets watched (issue 13), and a wrong aggregate is only
// discovered while the cohort is already playing. The aggregates themselves are
// SQL and belong to the real database; what a unit test can hold is the shell
// around them -- the admin gate, and the two filters that decide which rows
// every one of those nineteen queries even sees.
//
// The fake client mirrors neon's composability: a tagged call returns a
// thenable that is also a fragment, so nested `sql` fragments (the versions IN
// list, the dev condition, the `runs` subquery) can be rendered back into the
// text the handler would have sent.

import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DATABASE_URL = 'postgres://fake/unit-test'

const db = { fail: false, failFeedback: false }
const sent = []

// Render a fragment tree the way neon flattens it: nested fragments splice in,
// scalars become bound parameters recorded in `params`.
function render(node, params) {
  let text = ''
  node.strings.forEach((chunk, i) => {
    text += chunk
    if (i < node.vals.length) {
      const val = node.vals[i]
      if (val && val.strings) text += render(val, params)
      else { params.push(val); text += `$${params.length}` }
    }
  })
  return text
}

function sqlTag(strings, ...vals) {
  const node = { strings, vals }
  const params = []
  const text = render(node, params).replace(/\s+/g, ' ').trim()
  const rows = () => {
    if (db.fail) throw new Error('statement timeout')
    if (db.failFeedback && text.includes('from feedback')) throw new Error('relation "feedback" does not exist')
    return []
  }
  // Recorded only when awaited, so a fragment built for composition is not
  // mistaken for a query the handler actually ran.
  const promise = new Promise((resolve, reject) => {
    queueMicrotask(() => {
      sent.push(text)
      try { resolve(rows()) } catch (err) { reject(err) }
    })
  })
  // Promise.all abandons its siblings on the first rejection, and fragments
  // built only for composition are never awaited at all -- swallow those so
  // they do not surface as unhandled rejections.
  promise.catch(() => {})
  return Object.assign(promise, node)
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlTag }))

const { default: handler } = await import('../api/stats.js')

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function call({ method = 'GET', query, token = 'admin-secret' } = {}) {
  const res = mockRes()
  await handler({
    method,
    query,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }, res)
  return res
}

// The scoped subquery every aggregation reads from.
const scoped = () => sent.find(text => text.includes('select * from runs'))

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'admin-secret'
  db.fail = false
  db.failFeedback = false
  sent.length = 0
})

describe('GET /api/stats -- the admin gate', () => {
  it('rejects non-GET with an Allow header', async () => {
    const res = await call({ method: 'POST' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
  })

  it('refuses a request with the wrong bearer token, or none', async () => {
    for (const token of [null, 'wrong-secret', 'Bearer admin-secret']) {
      const res = await call({ token })
      expect(res.statusCode, String(token)).toBe(401)
      expect(res.body.error).toBe('unauthorized')
    }
    expect(sent).toHaveLength(0)
  })

  it('503s rather than opening up when ADMIN_TOKEN is unset', async () => {
    // An unset secret must not read as an empty accepted one: this endpoint
    // exposes every player's run history.
    delete process.env.ADMIN_TOKEN
    for (const token of [null, 'admin-secret', '']) {
      const res = await call({ token })
      expect(res.statusCode, String(token)).toBe(503)
      expect(res.body.error).toBe('admin_token_not_configured')
    }
    expect(sent).toHaveLength(0)
  })

  it('answers a correctly authorized request', async () => {
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(res.body.versions).toEqual([])
    expect(res.body.generatedAt).toBeGreaterThan(0)
  })
})

describe('GET /api/stats -- dev runs', () => {
  it('hides dev-tool runs from every aggregation by default', async () => {
    await call()
    expect(scoped()).toContain('dev is not true')
  })

  it('folds them back in on request', async () => {
    for (const includeDev of ['1', 'true']) {
      sent.length = 0
      await call({ query: { includeDev } })
      expect(scoped(), includeDev).not.toContain('dev is not true')
    }
  })

  it('treats any other value as "no"', async () => {
    for (const includeDev of ['0', 'yes', 'TRUE', '', 1, true]) {
      sent.length = 0
      await call({ query: { includeDev } })
      expect(scoped(), String(includeDev)).toContain('dev is not true')
    }
  })
})

describe('GET /api/stats -- the version filter', () => {
  it('sees every version, legacy unstamped rows included, when absent', async () => {
    const res = await call()
    expect(scoped()).not.toContain('game_version in')
    expect(res.body.versions).toEqual([])
  })

  it('scopes every aggregation to the versions asked for', async () => {
    const res = await call({ query: { versions: '0.3,0.4' } })
    expect(scoped()).toContain('game_version in')
    expect(res.body.versions).toEqual(['0.3', '0.4'])
  })

  it('binds each version as a parameter rather than inlining it', async () => {
    // The list is caller-supplied and flows into nineteen queries, so it must
    // never reach the text of any of them.
    const res = await call({ query: { versions: "0.4' or 1=1 --,0.3" } })
    expect(res.body.versions).toEqual(["0.4' or 1=1 --", '0.3'])
    expect(scoped()).toContain('game_version in ($1, $2)')
    expect(scoped()).not.toContain('1=1')
  })

  it('trims and drops blanks, and an all-blank list means no filter', async () => {
    const res = await call({ query: { versions: ' 0.3 , ,0.4,, ' } })
    expect(res.body.versions).toEqual(['0.3', '0.4'])
    sent.length = 0
    const none = await call({ query: { versions: ' , ,, ' } })
    expect(none.body.versions).toEqual([])
    expect(scoped()).not.toContain('game_version in')
  })

  it('ignores a versions parameter that is not a string', async () => {
    const res = await call({ query: { versions: ['0.3', '0.4'] } })
    expect(res.body.versions).toEqual([])
    expect(scoped()).not.toContain('game_version in')
  })
})

describe('GET /api/stats -- failure', () => {
  it('still answers when the feedback table does not exist yet', async () => {
    // /api/feedback creates it lazily, so before the first note ever lands the
    // dashboard must render rather than 500.
    db.failFeedback = true
    const res = await call()
    expect(res.statusCode).toBe(200)
    expect(res.body.recentFeedback).toEqual([])
  })

  it('reports a failed aggregation as 500 and leaks nothing about it', async () => {
    db.fail = true
    const res = await call()
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'query_failed' })
  })
})
