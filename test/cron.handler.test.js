// /api/cron-backfill-runs: who may run the weekly backfill (issue 33).
//
// The job itself is one idempotent insert-select that runs entirely in
// Postgres, so what a unit test can hold is the part that does not need a
// database: the authorization, which is the only thing standing between a
// public URL and a job that walks every account's stored history. Whether the
// SQL folds the right rows across is provable only against the real database --
// that belongs to issue 13.
//
// DATABASE_URL must be set before importing: the client is built at module
// scope. ADMIN_TOKEN and CRON_SECRET are read per request, so they vary here.

import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.DATABASE_URL = 'postgres://fake/unit-test'

const db = { inserted: 0, fail: false }
const queries = []

function sqlTag(strings, ...vals) {
  const text = strings.join('?')
  queries.push({ text, vals })
  if (db.fail) return Promise.reject(new Error('statement timeout'))
  if (text.includes('insert into runs')) {
    return Promise.resolve(Array.from({ length: db.inserted }, () => ({ '?column?': 1 })))
  }
  return Promise.resolve([])
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlTag }))

const { default: handler } = await import('../api/cron-backfill-runs.js')

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function call(authorization) {
  const res = mockRes()
  await handler({ method: 'GET', headers: authorization ? { authorization } : {} }, res)
  return res
}

const backfill = () => queries.find(q => q.text.includes('insert into runs'))

beforeEach(() => {
  process.env.ADMIN_TOKEN = 'admin-secret'
  process.env.CRON_SECRET = 'cron-secret'
  db.inserted = 0
  db.fail = false
  queries.length = 0
})

describe('/api/cron-backfill-runs -- authorization', () => {
  it('accepts the CRON_SECRET Vercel attaches to a scheduled run', async () => {
    const res = await call('Bearer cron-secret')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, backfilled: 0 })
  })

  it('accepts ADMIN_TOKEN, so the job can be triggered by hand', async () => {
    expect((await call('Bearer admin-secret')).statusCode).toBe(200)
  })

  it('refuses anything else, without touching the database', async () => {
    for (const header of [
      undefined, '', 'Bearer ', 'Bearer wrong-secret', 'admin-secret',
      'Basic admin-secret', 'bearer admin-secret',
    ]) {
      const res = await call(header)
      expect(res.statusCode, String(header)).toBe(401)
      expect(res.body.error).toBe('unauthorized')
    }
    expect(backfill()).toBeUndefined()
  })

  it('refuses every request when neither secret is configured', async () => {
    // An unset env var must not read as an empty accepted token -- that would
    // leave the job open to anyone who found the URL.
    delete process.env.ADMIN_TOKEN
    delete process.env.CRON_SECRET
    for (const header of [undefined, 'Bearer ', 'Bearer undefined', 'Bearer cron-secret']) {
      const res = await call(header)
      expect(res.statusCode, String(header)).toBe(503)
      expect(res.body.error).toBe('cron_not_configured')
    }
    expect(backfill()).toBeUndefined()
  })

  it('still accepts the one secret that is set when the other is not', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer admin-secret')).statusCode).toBe(200)
    expect((await call('Bearer cron-secret')).statusCode).toBe(401)
  })
})

describe('/api/cron-backfill-runs -- the job', () => {
  it('reports how many runs it recovered', async () => {
    db.inserted = 7
    const res = await call('Bearer cron-secret')
    expect(res.body).toEqual({ ok: true, backfilled: 7 })
  })

  it('folds profile history into runs, skipping what is already stored', async () => {
    await call('Bearer cron-secret')
    const job = backfill()
    expect(job.text).toContain('from profiles p')
    expect(job.text).toContain('jsonb_array_elements')
    // Idempotence is what makes a re-run safe, and it lives in this one clause.
    expect(job.text).toContain('on conflict (run_key) do nothing')
    // No parameters: the whole job stays in Postgres, nothing is shipped out.
    expect(job.vals).toEqual([])
  })

  it('reports a failed job as 500 and leaks nothing about it', async () => {
    db.fail = true
    const res = await call('Bearer cron-secret')
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'backfill_failed' })
  })
})
