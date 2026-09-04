// /api/auth and the Google verification behind it (issue 33).
//
// This is the trust boundary for cross-device saves: everything /api/save will
// ever believe about who a caller is comes from the session token minted here.
// Rather than mock the verification away, these tests stub `fetch` and drive the
// real verifyGoogleCredential, so the checks that actually matter -- audience,
// verified email, a present subject -- are the ones under test.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../api/auth.js'
import { verifySession } from '../api/_lib/session.js'

const CLIENT_ID = 'unit-test.apps.googleusercontent.com'
const SECRET = 'unit-test-secret'

// What the stubbed tokeninfo endpoint answers with next.
const tokeninfo = { ok: true, body: {} }
let fetched = []

const googleUser = (over = {}) => ({
  aud: CLIENT_ID,
  sub: 'google-sub-123',
  email: 'player@example.com',
  email_verified: true,
  name: 'A Player',
  picture: 'https://example.com/p.png',
  ...over,
})

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function call({ method = 'POST', body } = {}) {
  const res = mockRes()
  await handler({ method, body, headers: {} }, res)
  return res
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID
  process.env.SESSION_SECRET = SECRET
  tokeninfo.ok = true
  tokeninfo.body = googleUser()
  fetched = []
  vi.stubGlobal('fetch', url => {
    fetched.push(String(url))
    return Promise.resolve({ ok: tokeninfo.ok, json: () => Promise.resolve(tokeninfo.body) })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID
  process.env.SESSION_SECRET = SECRET
})

describe('POST /api/auth -- the gate', () => {
  it('rejects non-POST with an Allow header', async () => {
    const res = await call({ method: 'GET' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('503s rather than half-working when the environment is unconfigured', async () => {
    // Sign-in is optional: without config the client stays purely local, so the
    // endpoint has to say "not configured" instead of failing some other way.
    for (const missing of ['GOOGLE_CLIENT_ID', 'SESSION_SECRET']) {
      const kept = process.env[missing]
      delete process.env[missing]
      const res = await call({ body: { credential: 'anything' } })
      expect(res.statusCode, missing).toBe(503)
      expect(res.body.error).toBe('auth_not_configured')
      process.env[missing] = kept
    }
    expect(fetched).toHaveLength(0)
  })

  it('400s a body with no credential, without calling Google', async () => {
    for (const body of [undefined, {}, { credential: '' }, 'not json at all']) {
      const res = await call({ body })
      expect(res.statusCode, JSON.stringify(body) ?? 'undefined').toBe(400)
      expect(res.body.error).toBe('missing_credential')
    }
    expect(fetched).toHaveLength(0)
  })

  it('accepts a body that arrived as an unparsed JSON string', async () => {
    const res = await call({ body: JSON.stringify({ credential: 'good-token' }) })
    expect(res.statusCode).toBe(200)
  })
})

describe('POST /api/auth -- what Google has to say', () => {
  it('mints a session token for a verified credential', async () => {
    const res = await call({ body: { credential: 'good-token' } })
    expect(res.statusCode).toBe(200)
    expect(res.body.user).toEqual({
      sub: 'google-sub-123',
      email: 'player@example.com',
      name: 'A Player',
      picture: 'https://example.com/p.png',
    })
    const session = verifySession(res.body.token, SECRET)
    expect(session.sub).toBe('google-sub-123')
    expect(session.email).toBe('player@example.com')
    expect(session.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('sends the credential to tokeninfo, encoded', async () => {
    await call({ body: { credential: 'a token/with?chars' } })
    expect(fetched[0]).toContain('oauth2.googleapis.com/tokeninfo')
    expect(fetched[0]).toContain(encodeURIComponent('a token/with?chars'))
  })

  it('refuses a token minted for someone else’s OAuth client', async () => {
    // Without the audience check, any Google ID token from any app would sign
    // a caller in as that token's subject.
    tokeninfo.body = googleUser({ aud: 'some-other-app.apps.googleusercontent.com' })
    const res = await call({ body: { credential: 'foreign-token' } })
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('invalid_credential')
    expect(res.body.token).toBeUndefined()
  })

  it('refuses an unverified email, and accepts Google’s string "true"', async () => {
    tokeninfo.body = googleUser({ email_verified: false })
    expect((await call({ body: { credential: 't' } })).statusCode).toBe(401)
    tokeninfo.body = googleUser({ email_verified: 'false' })
    expect((await call({ body: { credential: 't' } })).statusCode).toBe(401)
    tokeninfo.body = googleUser({ email_verified: 'true' })
    expect((await call({ body: { credential: 't' } })).statusCode).toBe(200)
  })

  it('refuses a credential with no subject to be an account', async () => {
    tokeninfo.body = googleUser({ sub: undefined })
    expect((await call({ body: { credential: 't' } })).statusCode).toBe(401)
  })

  it('refuses when tokeninfo rejects the token or the network fails', async () => {
    tokeninfo.ok = false
    expect((await call({ body: { credential: 'expired' } })).statusCode).toBe(401)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('getaddrinfo ENOTFOUND')))
    const res = await call({ body: { credential: 'good-token' } })
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('invalid_credential')
  })

  it('falls back to the email as a display name, and tolerates no picture', async () => {
    tokeninfo.body = googleUser({ name: undefined, picture: undefined })
    const res = await call({ body: { credential: 't' } })
    expect(res.body.user.name).toBe('player@example.com')
    expect(res.body.user.picture).toBeNull()
  })
})
