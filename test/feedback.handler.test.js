// The /api/feedback handler (issue 33).
//
// Open to guests, which is what makes it worth testing: the only things between
// a public write endpoint and a spam column are a per-IP rate limit and the
// rule that feedback claiming a real account must present that account's token
// (issue 07). Both are asserted here, along with what actually lands in the row.
//
// Env must be set before importing: the Neon client is built at module scope.

import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DATABASE_URL = 'postgres://fake/unit-test'
process.env.SESSION_SECRET = 'unit-test-secret'

// How many hits the fake limiter reports for the next request.
const limiter = { hits: 1 }
const db = { fail: false }
const queries = []

function sqlTag(strings, ...vals) {
  const text = strings.join('?')
  queries.push({ text, vals })
  if (text.includes('rate_limits') && text.includes('returning hits')) {
    return Promise.resolve([{ hits: limiter.hits }])
  }
  if (db.fail && text.includes('insert into feedback')) {
    return Promise.reject(new Error('statement timeout'))
  }
  return Promise.resolve([])
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlTag }))

const { default: handler } = await import('../api/feedback.js')
const { signSession } = await import('../api/_lib/session.js')

const tokenFor = sub => signSession({ sub }, process.env.SESSION_SECRET)

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function call({ method = 'POST', body, token } = {}) {
  const res = mockRes()
  await handler({
    method,
    body,
    headers: {
      'x-forwarded-for': '203.0.113.7',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }, res)
  return res
}

const insert = () => queries.find(q => q.text.includes('insert into feedback'))

beforeEach(() => {
  limiter.hits = 1
  db.fail = false
  queries.length = 0
})

describe('POST /api/feedback -- the gate', () => {
  it('rejects non-POST with an Allow header', async () => {
    const res = await call({ method: 'GET' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('takes a guest note with no token', async () => {
    const res = await call({ body: { message: 'the Forge never opened' } })
    expect(res.statusCode).toBe(202)
    expect(res.body).toEqual({ ok: true })
    expect(insert().vals[0]).toBe('guest')
  })

  it('refuses a note filed under an account with no matching token', async () => {
    // Otherwise anyone could file spam, or a fake bug report, as any player.
    const res = await call({ body: { message: 'hi', accountId: 'google-sub-123' } })
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('account_not_authenticated')
    expect(insert()).toBeUndefined()
  })

  it('refuses a token belonging to a different account', async () => {
    const res = await call({
      body: { message: 'hi', accountId: 'google-sub-123' },
      token: tokenFor('google-sub-456'),
    })
    expect(res.statusCode).toBe(401)
    expect(insert()).toBeUndefined()
  })

  it('takes a note whose token matches the account it claims', async () => {
    const res = await call({
      body: { message: 'hi', accountId: 'google-sub-123' },
      token: tokenFor('google-sub-123'),
    })
    expect(res.statusCode).toBe(202)
    expect(insert().vals[0]).toBe('google-sub-123')
  })

  it('turns the sixth note in a minute away with a Retry-After', async () => {
    limiter.hits = 6
    const res = await call({ body: { message: 'again' } })
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('60')
    expect(insert()).toBeUndefined()
  })

  it('rate limits before it reads the body at all', async () => {
    // A flood costs one limiter query and nothing else.
    limiter.hits = 99
    await call({ body: { message: 'x', accountId: 'google-sub-123' } })
    expect(queries).toHaveLength(1)
  })
})

describe('POST /api/feedback -- what gets stored', () => {
  it('refuses an empty or whitespace-only message', async () => {
    for (const body of [undefined, {}, { message: '' }, { message: '   \n ' }, { message: 42 }]) {
      const res = await call({ body })
      expect(res.statusCode, JSON.stringify(body) ?? 'undefined').toBe(400)
      expect(res.body.error).toBe('empty_message')
    }
    expect(insert()).toBeUndefined()
  })

  it('accepts a body that arrived as an unparsed JSON string', async () => {
    const res = await call({ body: JSON.stringify({ message: 'from a string body' }) })
    expect(res.statusCode).toBe(202)
    expect(insert().vals[2]).toBe('from a string body')
  })

  it('trims the message and caps it at 4000 characters', async () => {
    const res = await call({ body: { message: `  ${'x'.repeat(5000)}  ` } })
    expect(res.statusCode).toBe(202)
    expect(insert().vals[2]).toHaveLength(4000)
  })

  it('keeps a known kind and drops an invented one', async () => {
    await call({ body: { message: 'a', kind: 'bug' } })
    expect(insert().vals[1]).toBe('bug')
    queries.length = 0
    await call({ body: { message: 'a', kind: 'urgent!!' } })
    expect(insert().vals[1]).toBeNull()
  })

  it('stores the version and context blob, and nulls what it cannot use', async () => {
    await call({
      body: { message: 'a', gameVersion: '0.4', context: { phase: 'sanctuary', sigils: 3 } },
    })
    expect(insert().vals[3]).toBe('0.4')
    expect(JSON.parse(insert().vals[4])).toEqual({ phase: 'sanctuary', sigils: 3 })
    queries.length = 0
    await call({ body: { message: 'a', gameVersion: 4, context: 'not an object' } })
    expect(insert().vals[3]).toBeNull()
    expect(insert().vals[4]).toBeNull()
  })

  it('reports a failed insert as 500 and leaks nothing about it', async () => {
    db.fail = true
    const res = await call({ body: { message: 'a' } })
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'insert_failed' })
  })
})
