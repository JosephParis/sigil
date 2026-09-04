// The /api/save handler: the whole cross-device sync path (issue 33).
//
// There is no /api in `vite dev`, so no e2e test can reach this handler at all.
// It read-merge-writes a single jsonb blob per account, and the client copies
// whatever comes back over local storage -- which makes it the one endpoint
// that can silently destroy a player's progress. The merge itself is covered in
// merge.profiles.test.js; this covers the handler around it: the auth gate, the
// account coming from the token rather than the body, and what actually lands
// in the row.
//
// Env must be set before importing the module: it builds its Neon client at
// module scope.
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DATABASE_URL = 'postgres://fake/unit-test'
process.env.SESSION_SECRET = 'unit-test-secret'

// The fake database. `data: null` means the account has no row yet; `fail`
// makes the next query reject, standing in for a dropped connection.
const db = { data: null, fail: false }
const queries = []

function sqlTag(strings, ...vals) {
  const text = strings.join('?')
  queries.push({ text, vals })
  if (db.fail) return Promise.reject(new Error('connection reset by peer'))
  if (text.includes('select data from profiles')) {
    return Promise.resolve(db.data === null ? [] : [{ data: db.data }])
  }
  if (text.includes('insert into profiles')) {
    db.data = JSON.parse(vals[2])
    return Promise.resolve([])
  }
  return Promise.resolve([])
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlTag }))

const { default: handler } = await import('../api/save.js')
const { signSession } = await import('../api/_lib/session.js')

const tokenFor = (sub, email) =>
  signSession({ sub, ...(email ? { email } : {}) }, process.env.SESSION_SECRET)

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function call({ method = 'POST', body, token } = {}) {
  const res = mockRes()
  await handler({ method, body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res)
  return res
}

const profile = (over = {}) => ({
  library: ['numb'], ascensionUnlocked: 1, tutorialCompleted: true,
  seenSpecials: [], history: [], save: null, ...over,
})

const insert = () => queries.find(q => q.text.includes('insert into profiles'))

beforeEach(() => {
  db.data = null
  db.fail = false
  queries.length = 0
})

describe('/api/save -- method and auth', () => {
  it('rejects anything but GET or POST with an Allow header', async () => {
    const res = await call({ method: 'DELETE', token: tokenFor('acct-1') })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET, POST')
  })

  it('refuses a request with no session token, before touching the database', async () => {
    const res = await call({ body: { data: profile() } })
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('unauthorized')
    expect(queries).toHaveLength(0)
  })

  it('refuses a forged or corrupted token', async () => {
    const tampered = `${tokenFor('acct-1')}x`
    expect((await call({ body: { data: profile() }, token: tampered })).statusCode).toBe(401)
    expect((await call({ body: { data: profile() }, token: 'not.a.jwt' })).statusCode).toBe(401)
    expect(queries).toHaveLength(0)
  })

  it('refuses a token signed with a different secret', async () => {
    const foreign = signSession({ sub: 'acct-1' }, 'some-other-secret')
    expect((await call({ body: { data: profile() }, token: foreign })).statusCode).toBe(401)
  })
})

describe('GET /api/save', () => {
  it('returns an empty profile for an account that has never synced', async () => {
    const res = await call({ method: 'GET', token: tokenFor('acct-1') })
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toEqual({})
    expect(insert()).toBeUndefined()
  })

  it('returns the stored blob and writes nothing', async () => {
    db.data = profile({ library: ['numb', 'stoic'] })
    const res = await call({ method: 'GET', token: tokenFor('acct-1') })
    expect(res.body.data).toEqual(db.data)
    expect(insert()).toBeUndefined()
  })

  it('reads the account named by the token', async () => {
    await call({ method: 'GET', token: tokenFor('acct-42') })
    const read = queries.find(q => q.text.includes('select data from profiles'))
    expect(read.vals).toEqual(['acct-42'])
  })
})

describe('POST /api/save', () => {
  it('merges the client snapshot into the stored profile and returns the union', async () => {
    db.data = profile({ library: ['numb'], ascensionUnlocked: 3 })
    const res = await call({
      body: { data: profile({ library: ['stoic'], ascensionUnlocked: 1 }) },
      token: tokenFor('acct-1'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.body.data.library.sort()).toEqual(['numb', 'stoic'])
    expect(res.body.data.ascensionUnlocked).toBe(3)
  })

  it('persists exactly what it returned', async () => {
    db.data = profile({ library: ['numb'] })
    const res = await call({ body: { data: profile({ library: ['cloak'] }) }, token: tokenFor('acct-1') })
    expect(db.data).toEqual(res.body.data)
  })

  it('writes the row under the token account, never the one named in the body', async () => {
    // The whole point of the account-from-token rule: a client cannot write to
    // someone else's row by naming them in the payload.
    await call({
      body: { data: profile(), accountId: 'someone-else', account_id: 'someone-else' },
      token: tokenFor('acct-1', 'player@example.com'),
    })
    expect(insert().vals[0]).toBe('acct-1')
    expect(insert().vals[1]).toBe('player@example.com')
    expect(JSON.stringify(queries)).not.toContain('someone-else')
  })

  it('stores a null email when the token carries none', async () => {
    await call({ body: { data: profile() }, token: tokenFor('acct-1') })
    expect(insert().vals[1]).toBeNull()
  })

  it('accepts a body that arrived as an unparsed JSON string', async () => {
    const res = await call({ body: JSON.stringify({ data: profile() }), token: tokenFor('acct-1') })
    expect(res.statusCode).toBe(200)
    expect(res.body.data.library).toEqual(['numb'])
  })

  it('rejects a body with no usable profile rather than storing an empty one', async () => {
    db.data = profile({ library: ['numb', 'stoic'] })
    const before = db.data
    for (const body of [undefined, {}, { data: null }, { data: 'nope' }, 'not json at all']) {
      const res = await call({ body, token: tokenFor('acct-1') })
      expect(res.statusCode, JSON.stringify(body) ?? 'undefined').toBe(400)
      expect(res.body.error).toBe('invalid_payload')
    }
    // None of them overwrote the stored profile.
    expect(db.data).toBe(before)
    expect(insert()).toBeUndefined()
  })

  it('reports a database failure as 500 and leaks nothing about it', async () => {
    db.fail = true
    const res = await call({ body: { data: profile() }, token: tokenFor('acct-1') })
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'sync_failed' })
  })
})
