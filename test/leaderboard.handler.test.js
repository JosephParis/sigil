import { describe, it, expect, vi, beforeEach } from 'vitest'

// Covers the parts of /api/leaderboard that decide *who gets published*: the
// blocklist subtraction added by issue 08, and the guarantees the endpoint's
// own docblock makes about identity. The ranking SQL itself is Postgres's job
// and is not reimplemented here; what is asserted is that the filters are in
// the query the handler builds, since a moderation filter that quietly stops
// being applied looks exactly like one that works.
process.env.DATABASE_URL = 'postgres://fake/unit-test'

const queries = []
// Every query since the module was imported, including the ones from a warm
// instance's one-time table setup, which beforeEach must not clear.
const allQueries = []
let canned = []

function sqlTag(strings, ...vals) {
  const text = strings.join('?')
  queries.push({ text, vals })
  allQueries.push({ text, vals })
  const hit = canned.find(([needle]) => text.includes(needle))
  return Promise.resolve(hit ? hit[1] : [])
}

vi.mock('@neondatabase/serverless', () => ({ neon: () => sqlTag }))

const { default: handler } = await import('../api/leaderboard.js')

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} }
  res.status = code => { res.statusCode = code; return res }
  res.json = body => { res.body = body; return res }
  res.setHeader = (k, v) => { res.headers[k] = v }
  return res
}

async function get(query = {}) {
  const res = mockRes()
  await handler({ method: 'GET', query, headers: {} }, res)
  return res
}

function built(needle) {
  return queries.filter(q => q.text.includes(needle))
}

// The ranked-best subquery, as opposed to the CREATE TABLE that also mentions
// blocked_accounts.
function rankedFragments() {
  return queries.filter(q => q.text.includes('row_number()'))
}

const ROW = {
  rank: '1', player_name: 'Cassandra', ascension: 2, sigils_earned: 10,
  duration_ms: '900000', ended_at: '1750000000000', mode: 'default',
  game_version: '0.4', account_id: 'sub-1',
}

beforeEach(() => {
  queries.length = 0
  canned = []
})

describe('GET /api/leaderboard — method', () => {
  it('rejects anything but GET', async () => {
    const res = mockRes()
    await handler({ method: 'POST', query: {}, headers: {} }, res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
  })
})

describe('GET /api/leaderboard — moderation', () => {
  it('subtracts blocked accounts inside the ranked subquery', async () => {
    await get()
    // Inside, not after: excluding a blocked account once row_number() has
    // already run would leave a gap in the ranking where their row was.
    const ranked = rankedFragments()
    expect(ranked).toHaveLength(1)
    expect(ranked[0].text).toContain('not exists')
    expect(ranked[0].text).toContain('blocked_accounts')
  })

  it('applies the same exclusion to the caller\'s own rank query', async () => {
    await get({ me: 'sub-1' })
    // One fragment, used by both the page query and the caller's-own-rank
    // query, so the two always rank against the same population -- and a
    // blocked player cannot see their own row either.
    expect(rankedFragments()).toHaveLength(1)
    expect(built('order by rank asc')).toHaveLength(1)
    expect(built('from ? b where b.account_id =')).toHaveLength(1)
  })

  it('creates the blocklist table before querying it', async () => {
    // The board is public and runs on a cold database on a fresh deployment;
    // a missing relation here would 500 the whole page.
    expect(allQueries.some(q => q.text.includes('create table if not exists blocked_accounts')))
      .toBe(true)
  })

  it('still filters dev runs and handle-less runs', async () => {
    await get()
    const ranked = rankedFragments()[0]
    expect(ranked.text).toContain('dev is not true')
    expect(ranked.text).toContain("playerName")
  })

  it("serves one seed's board, entered seeds included, when asked", async () => {
    const res = await get({ seed: 'k7q2-m9xd' })
    expect(res.statusCode).toBe(200)
    expect(res.body.seed).toBe('K7Q2M9XD')
    // The pool condition is its own sql fragment, interpolated into the
    // ranked subquery, so the fake client records it as a separate query.
    const pool = built("r.record->>'seed' = ?")
    expect(pool).toHaveLength(1)
    // Matched on the canonical code, as a bound value, never spliced in.
    expect(pool[0].vals).toEqual(['K7Q2M9XD'])
    // Everyone on the seed races: the entered-seed exclusion is the main
    // board's rule, and on a seed board it would drop every friend's run.
    expect(built('seedChosen')).toHaveLength(0)
    // The rest of the population rules still hold.
    const ranked = rankedFragments()[0]
    expect(ranked.text).toContain('dev is not true')
    expect(ranked.text).toContain('blocked_accounts')
  })

  it('refuses a seed it cannot read rather than serving the main board', async () => {
    // Not 'not a seed': with the spaces gone that is NOTASEED, which reads.
    const res = await get({ seed: 'nope!' })
    expect(res.statusCode).toBe(400)
    expect(rankedFragments()).toHaveLength(0)
  })

  it('keeps runs on an entered seed off the main board', async () => {
    await get()
    // Issue 38: replaying a known seed is a head start, so those runs do not
    // race fresh ones. Inside the ranked subquery, for the same reason as the
    // blocklist: filtering afterwards would leave holes in the ranking.
    expect(built("coalesce(r.record->>'seedChosen', 'false') <> 'true'")).toHaveLength(1)
    expect(built("r.record->>'seed' = ?")).toHaveLength(0)
  })
})

describe('GET /api/leaderboard — response', () => {
  it('never returns an account id', async () => {
    canned = [['order by rank asc', [ROW]]]
    const res = await get()
    expect(res.statusCode).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(JSON.stringify(res.body)).not.toContain('sub-1')
  })

  it('coerces the bigint strings Postgres returns', async () => {
    canned = [['order by rank asc', [ROW]]]
    const { body } = await get()
    expect(body.entries[0]).toMatchObject({
      rank: 1, durationMs: 900000, endedAt: 1750000000000, playerName: 'Cassandra',
    })
  })

  it('marks the caller\'s own rows', async () => {
    canned = [['order by rank asc', [ROW]]]
    const { body } = await get({ me: 'sub-1' })
    expect(body.entries[0].you).toBe(true)
  })

  it('does not mark rows for a guest caller — the id identifies no one', async () => {
    canned = [['order by rank asc', [{ ...ROW, account_id: 'guest' }]]]
    const { body } = await get({ me: 'guest' })
    expect(body.entries[0].you).toBe(false)
  })

  it('clamps limit to the maximum', async () => {
    await get({ limit: '5000' })
    const page = built('order by rank asc')[0]
    expect(page.vals).toContain(100)
  })

  it('falls back to the default limit for nonsense', async () => {
    await get({ limit: 'lots' })
    expect(built('order by rank asc')[0].vals).toContain(25)
  })
})

// -- Guests are told apart by device, not by name ----------------------------
//
// The bug this replaced: guests all post as account_id 'guest', so the query
// added the player's *name* to the grouping key. Name equality was therefore
// treated as person equality, and two guests sharing a name -- assigned or
// typed -- collapsed into one ranked row. The slower of them disappeared from
// a board they had earned a place on.

describe('/api/leaderboard — guest identity', () => {
  it('partitions guests on deviceId', async () => {
    await get()
    const [ranked] = rankedFragments()
    expect(ranked.text).toContain("r.record->>'deviceId'")
  })

  it('still falls back to the name for runs that predate deviceId', async () => {
    // Record v8 added the field. Every stored row older than it must keep
    // grouping exactly as it does today, so no board position moves on deploy.
    await get()
    const [ranked] = rankedFragments()
    const partition = ranked.text.slice(ranked.text.indexOf('partition by'))
    expect(partition).toContain("r.record->>'deviceId'")
    expect(partition).toContain("btrim(r.record->>'playerName')")
    // deviceId has to be preferred, or the fallback would never be reached.
    expect(partition.indexOf("deviceId")).toBeLessThan(partition.indexOf("playerName"))
  })

  it('does not group signed-in players by anything but their account', async () => {
    // Their name has never mattered and must not start to: a rename would
    // otherwise split one player into two entries.
    await get()
    const [ranked] = rankedFragments()
    expect(ranked.text).toContain('partition by r.account_id')
  })
})

describe('/api/leaderboard — whose row is whose', () => {
  const row = (over = {}) => ({
    rank: 1, account_id: 'guest', device_id: 'dev-a', player_name: 'Rookwarden',
    ascension: 0, sigils_earned: 10, duration_ms: 600000, ended_at: 1, mode: 'default',
    game_version: '0.4', ...over,
  })

  it('marks a guest own row from their device', async () => {
    // The reason this matters: with two identical names on the board, this is
    // the only thing that tells the player which one is theirs.
    canned = [['order by rank', [row()]]]
    const res = await get({ device: 'dev-a' })
    expect(res.body.entries[0].you).toBe(true)
  })

  it('does not mark another guest row', async () => {
    canned = [['order by rank', [row({ device_id: 'dev-b' })]]]
    const res = await get({ device: 'dev-a' })
    expect(res.body.entries[0].you).toBe(false)
  })

  it('never sends a device id to the client', async () => {
    // Marking is computed server-side precisely so this value never travels.
    canned = [['order by rank', [row()]]]
    const res = await get({ device: 'dev-a' })
    expect(res.body.entries[0]).not.toHaveProperty('device_id')
    expect(res.body.entries[0]).not.toHaveProperty('deviceId')
    expect(JSON.stringify(res.body)).not.toContain('dev-a')
  })

  it('never sends an account id either', async () => {
    canned = [['order by rank', [row({ account_id: 'sub-123', device_id: null })]]]
    const res = await get({ me: 'sub-123' })
    expect(res.body.entries[0]).not.toHaveProperty('account_id')
    expect(JSON.stringify(res.body.entries[0])).not.toContain('sub-123')
  })

  it('does not let a device mark a signed-in row', async () => {
    // device_id is only meaningful inside the guest bucket; a signed-in run
    // that happens to carry one must not be claimable by it.
    canned = [['order by rank', [row({ account_id: 'sub-123' })]]]
    const res = await get({ device: 'dev-a' })
    expect(res.body.entries[0].you).toBe(false)
  })

  it('reports a guest own rank when it falls outside the page', async () => {
    canned = [['order by rank', [row({ rank: 1, device_id: 'dev-b' })]],
              ['b.device_id', [row({ rank: 44 })]]]
    const res = await get({ device: 'dev-a' })
    expect(res.body.self?.rank).toBe(44)
    expect(res.body.selfInPage).toBe(false)
  })

  it('asks for the caller own best by device when there is no account', async () => {
    await get({ device: 'dev-a' })
    const self = built('b.device_id')
    expect(self).toHaveLength(1)
    expect(self[0].vals).toContain('dev-a')
  })

  it('prefers the account when both are sent', async () => {
    // A signed-in player on their own device: the account is the better answer
    // and the one whose rows the board actually groups.
    await get({ me: 'sub-123', device: 'dev-a' })
    expect(built('b.device_id')).toHaveLength(0)
    expect(built('b.account_id = ')).toHaveLength(1)
  })
})
