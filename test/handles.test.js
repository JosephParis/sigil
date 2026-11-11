import { describe, it, expect, vi, beforeEach } from 'vitest'
import { candidatesFor, ownerOf, resolveHandle } from '../api/_lib/handles.js'
import { MAX_HANDLE_LENGTH } from '../src/games/scoundrel/handle.js'
import { assignedNameFor } from '../src/games/scoundrel/assignedName.js'

// The uniqueness rule behind the board: one name, one owner, never released.
//
// Two halves are worth testing separately. candidatesFor is the user-visible
// half -- what your name turns into when someone already has it -- and is pure.
// resolveHandle is the concurrency-sensitive half, and what matters there is
// that it claims atomically and never fails a run.

describe('candidatesFor', () => {
  it('asks for the name itself first', () => {
    expect(candidatesFor('Rookwarden')[0]).toBe('Rookwarden')
  })

  it('counts up from a trailing number rather than suffixing it', () => {
    // An assigned name already ends in one. "Ashen Vagrant 48" keeps the
    // register and the length; "Ashen Vagrant 47 2" would fit neither.
    expect(candidatesFor('Ashen Vagrant 47').slice(0, 4))
      .toEqual(['Ashen Vagrant 47', 'Ashen Vagrant 48', 'Ashen Vagrant 49', 'Ashen Vagrant 50'])
  })

  it('counts up from an assigned name, which has no space before its number (issue 43)', () => {
    // The shape assignedNameFor really writes. Production stored a second
    // "LostAlmoner3016" as "LostAlmoner3016 2" while the rule only matched
    // "Ashen Vagrant 47".
    expect(candidatesFor('LostAlmoner3016').slice(0, 3))
      .toEqual(['LostAlmoner3016', 'LostAlmoner3017', 'LostAlmoner3018'])
    for (const seed of ['a', 'device-1', 'xyz-123']) {
      const name = assignedNameFor(seed)
      const n = Number.parseInt(name.match(/\d+$/)[0], 10)
      const next = candidatesFor(name)[1]
      expect(next, name).toBe(name.replace(/\d+$/, String(n + 1).padStart(4, '0')))
    }
  })

  it('keeps the width of a padded number', () => {
    expect(candidatesFor('Almoner0099')[1]).toBe('Almoner0100')
    expect(candidatesFor('Almoner9999')[1]).toBe('Almoner10000')
  })

  it('appends a counter to a name with no number', () => {
    expect(candidatesFor('Rookwarden').slice(0, 3))
      .toEqual(['Rookwarden', 'Rookwarden 2', 'Rookwarden 3'])
  })

  it('never proposes a name that will not fit', () => {
    for (const name of ['Rookwarden', 'Ashen Vagrant 47', 'a'.repeat(16), 'Ashen Almoner 99']) {
      for (const candidate of candidatesFor(name)) {
        expect(candidate.length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH)
      }
    }
  })

  it('trims the base to make room when the name is already full length', () => {
    const name = 'x'.repeat(MAX_HANDLE_LENGTH)
    const [first, second] = candidatesFor(name)
    expect(first).toBe(name)
    expect(second).toBe('x'.repeat(MAX_HANDLE_LENGTH - 2) + ' 2')
  })

  it('stops counting up when the next number would overflow', () => {
    // Built from the cap rather than spelled out, so raising MAX_HANDLE_LENGTH
    // does not turn a real assertion into a test of nothing: the name here is
    // exactly the cap, and one more digit would exceed it.
    const name = `${'x'.repeat(MAX_HANDLE_LENGTH - 3)} 99`
    expect(name).toHaveLength(MAX_HANDLE_LENGTH)
    const out = candidatesFor(name)
    expect(out).not.toContain(`${'x'.repeat(MAX_HANDLE_LENGTH - 3)} 100`)
    expect(out.every(c => c.length <= MAX_HANDLE_LENGTH)).toBe(true)
  })

  it('returns distinct candidates', () => {
    for (const name of ['Rookwarden', 'Ashen Vagrant 47', 'Rook 2']) {
      const out = candidatesFor(name)
      expect(new Set(out).size).toBe(out.length)
    }
  })

  it('is bounded, so a contested name cannot become a long walk', () => {
    expect(candidatesFor('Rook').length).toBeLessThanOrEqual(30)
  })
})

describe('ownerOf', () => {
  it('is the account for a signed-in run', () => {
    expect(ownerOf({ accountId: 'sub-123', deviceId: 'dev-1' })).toBe('sub-123')
  })

  it('is the device for a guest run', () => {
    expect(ownerOf({ accountId: 'guest', deviceId: 'dev-1' })).toBe('dev-1')
  })

  it('is nothing when a guest run carries no device', () => {
    // A client too old to send one. It cannot be told apart from any other
    // guest anyway, so there is nothing for it to own.
    expect(ownerOf({ accountId: 'guest' })).toBe('')
    expect(ownerOf({})).toBe('')
  })
})

describe('resolveHandle', () => {
  // Stand-in registry: a map from name_key to owner, with the same
  // insert-or-nothing semantics the real table has.
  let held
  let queries
  let failNext

  function sqlTag(strings, ...vals) {
    const text = strings.join('?')
    queries.push(text)
    if (failNext) {
      failNext = false
      return Promise.reject(new Error('registry down'))
    }
    if (text.includes('create table')) return Promise.resolve([])
    if (text.includes('insert into handles')) {
      const [key, name, owner] = vals
      if (held.has(key)) return Promise.resolve([])
      held.set(key, owner)
      return Promise.resolve([{ name }])
    }
    if (text.includes('select owner_id from handles')) {
      const [key] = vals
      return held.has(key) ? Promise.resolve([{ owner_id: held.get(key) }]) : Promise.resolve([])
    }
    return Promise.resolve([])
  }

  beforeEach(() => {
    held = new Map()
    queries = []
    failNext = false
    // The table-created flag is cached per module, so reset it between tests.
    vi.resetModules()
  })

  it('gives a free name to whoever asks first', async () => {
    expect(await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')).toBe('Rookwarden')
    expect(held.get('rookwarden')).toBe('owner-a')
  })

  it('disambiguates a name someone else holds', async () => {
    await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')
    expect(await resolveHandle(sqlTag, 'Rookwarden', 'owner-b')).toBe('Rookwarden 2')
  })

  it('keeps disambiguating as more owners pile onto one name', async () => {
    await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')
    await resolveHandle(sqlTag, 'Rookwarden', 'owner-b')
    expect(await resolveHandle(sqlTag, 'Rookwarden', 'owner-c')).toBe('Rookwarden 3')
  })

  it('hands a name straight back to the owner who already holds it', async () => {
    // The common case by far: every subsequent run by the same player.
    await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')
    expect(await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')).toBe('Rookwarden')
  })

  it('treats case as one claim', async () => {
    await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')
    expect(await resolveHandle(sqlTag, 'rookwarden', 'owner-b')).toBe('rookwarden 2')
  })

  it('counts up from an assigned name rather than suffixing it', async () => {
    await resolveHandle(sqlTag, 'Ashen Vagrant 47', 'owner-a')
    expect(await resolveHandle(sqlTag, 'Ashen Vagrant 47', 'owner-b')).toBe('Ashen Vagrant 48')
  })

  it('stores a second owner of an assigned name one number up (issue 43)', async () => {
    await resolveHandle(sqlTag, 'LostAlmoner3016', 'owner-a')
    expect(await resolveHandle(sqlTag, 'LostAlmoner3016', 'owner-b')).toBe('LostAlmoner3017')
  })

  it('claims atomically, without a read-then-write window', async () => {
    // Two concurrent posts of the same name must not both pass. The insert has
    // to be the thing that decides, not a preceding select.
    const [a, b] = await Promise.all([
      resolveHandle(sqlTag, 'Rookwarden', 'owner-a'),
      resolveHandle(sqlTag, 'Rookwarden', 'owner-b'),
    ])
    expect(new Set([a, b]).size).toBe(2)
    expect([a, b]).toContain('Rookwarden')
  })

  it('claims nothing for an empty name', async () => {
    expect(await resolveHandle(sqlTag, '', 'owner-a')).toBeNull()
    expect(await resolveHandle(sqlTag, null, 'owner-a')).toBeNull()
    expect(await resolveHandle(sqlTag, '   ', 'owner-a')).toBeNull()
    expect(held.size).toBe(0)
  })

  it('stores a name as-is when there is no owner to claim it', async () => {
    // Otherwise an old client is handed a disambiguated name it can never hold.
    expect(await resolveHandle(sqlTag, 'Rookwarden', '')).toBe('Rookwarden')
    expect(held.size).toBe(0)
  })

  it('falls back to the requested name when the registry throws', async () => {
    // A run must never be lost to a uniqueness check.
    failNext = true
    expect(await resolveHandle(sqlTag, 'Rookwarden', 'owner-a')).toBe('Rookwarden')
  })
})
