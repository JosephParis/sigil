import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installLocalStorage, uninstallLocalStorage } from './support/localStorage'
import { historyStore, boardFreshness, BOARD_FRESH_EVENT } from '../src/utils/historyStore.js'
import { fetchLeaderboard } from '../src/utils/leaderboard.js'

// Issue 45. The boards are cached at the edge for a minute, and production
// showed a player their previous best right after a better run (2026-11-11).
// The fix gives the board fetch a value that changes only once one of this
// device's runs is confirmed by the server, so the first look afterwards is a
// URL the cache has not seen, and nobody else's requests stop hitting it.

const RECORD = {
  accountId: 'guest', startedAt: 1_794_000_000_000, endedAt: 1_794_000_060_000,
  runSeed: 'rs_1', deviceId: 'device-1', outcome: 'death', sigilsEarned: 1,
}

let events
beforeEach(() => {
  installLocalStorage()
  events = 0
  const target = new EventTarget()
  target.addEventListener(BOARD_FRESH_EVENT, () => { events++ })
  vi.stubGlobal('window', target)
  vi.stubEnv('PROD', true)
})
afterEach(() => {
  uninstallLocalStorage()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const respond = status => vi.fn(async () => ({
  ok: status < 400, status, json: async () => ({ entries: [] }),
}))

describe('board freshness (issue 45)', () => {
  it('starts empty, so a fresh install asks for the cached board', () => {
    expect(boardFreshness()).toBe('')
  })

  it('moves when the server confirms a run, and says so', async () => {
    vi.stubGlobal('fetch', respond(202))
    localStorage.setItem('scoundrel:history:pending', JSON.stringify([RECORD]))
    await historyStore.reconcile()
    expect(boardFreshness()).not.toBe('')
    expect(events).toBe(1)
  })

  it('stays put when the post fails, so the board is not refetched for nothing', async () => {
    vi.stubGlobal('fetch', respond(500))
    localStorage.setItem('scoundrel:history:pending', JSON.stringify([RECORD]))
    await historyStore.reconcile()
    expect(boardFreshness()).toBe('')
    expect(events).toBe(0)
  })

  it('stays put with nothing to send', async () => {
    const fetch = respond(202)
    vi.stubGlobal('fetch', fetch)
    await historyStore.reconcile()
    expect(fetch).not.toHaveBeenCalled()
    expect(boardFreshness()).toBe('')
  })

  it('moves when a rename is confirmed, since the row changed name', async () => {
    vi.stubGlobal('fetch', respond(200))
    expect(await historyStore.claimRun('guest', RECORD, 'Rookwarden')).toBe(true)
    expect(boardFreshness()).not.toBe('')
  })

  it('rides on the board request, and only when there is one', async () => {
    const fetch = respond(200)
    vi.stubGlobal('fetch', fetch)
    await fetchLeaderboard({ daily: '2026-11-11', deviceId: 'device-1', fresh: '1794000061000' })
    await fetchLeaderboard({ daily: '2026-11-11', deviceId: 'device-1', fresh: '' })
    const [withFresh, without] = fetch.mock.calls.map(([url]) => new URL(url, 'https://x.test'))
    expect(withFresh.searchParams.get('fresh')).toBe('1794000061000')
    expect(withFresh.searchParams.get('daily')).toBe('2026-11-11')
    expect(without.searchParams.has('fresh')).toBe(false)
  })
})
