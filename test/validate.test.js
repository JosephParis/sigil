import { describe, it, expect } from 'vitest'
import {
  validateRunRecord, parseRunBatch, mayWriteAs, MAX_BATCH, MAX_PLAYER_NAME,
} from '../api/_lib/validate.js'
import { SIGIL_TARGET, VERSION_HISTORY, GAME_VERSION } from '../src/games/scoundrel/constants.js'

// A record shaped like buildRunRecord's output, valid by construction. Tests
// override single fields so each case isolates one rule.
const NOW = Date.parse('2026-07-29T12:00:00Z')
const HOUR = 60 * 60 * 1000

function record(overrides = {}) {
  return {
    accountId: 'guest',
    startedAt: NOW - HOUR,
    endedAt: NOW,
    durationMs: HOUR - 1000,
    outcome: 'death',
    sigilsEarned: 3,
    sigilTarget: SIGIL_TARGET,
    gameVersion: GAME_VERSION,
    playerName: 'Tester',
    ...overrides,
  }
}

const reason = r => (r.ok ? null : r.reason)

describe('validateRunRecord — seed (issue 39)', () => {
  it('accepts a canonical seed, and none at all', () => {
    expect(validateRunRecord(record({ seed: 'K7Q2M9XD', seedChosen: true }), NOW).ok).toBe(true)
    expect(validateRunRecord(record({ seed: null, seedChosen: false }), NOW).ok).toBe(true)
    expect(validateRunRecord(record(), NOW).ok).toBe(true)
  })

  it('refuses a seed the per-seed board could never match', () => {
    // The board matches the stored string exactly, so only the canonical form
    // buildRunRecord writes is accepted.
    expect(reason(validateRunRecord(record({ seed: 'k7q2-m9xd' }), NOW))).toBe('bad_seed')
    expect(reason(validateRunRecord(record({ seed: 'x'.repeat(5000) }), NOW))).toBe('bad_seed')
    expect(reason(validateRunRecord(record({ seed: 12345678 }), NOW))).toBe('bad_seed')
    expect(reason(validateRunRecord(record({ seedChosen: 'yes' }), NOW))).toBe('bad_seed_chosen')
  })
})

describe('validateRunRecord', () => {
  it('accepts a well-formed record', () => {
    expect(validateRunRecord(record(), NOW)).toEqual({ ok: true })
  })

  it('accepts a record with only the required fields', () => {
    const bare = { accountId: 'guest', startedAt: NOW - HOUR }
    expect(validateRunRecord(bare, NOW)).toEqual({ ok: true })
  })

  it.each([
    [null, 'not_an_object'],
    [undefined, 'not_an_object'],
    ['a string', 'not_an_object'],
    [[], 'not_an_object'],
  ])('rejects %s', (input, expected) => {
    expect(reason(validateRunRecord(input, NOW))).toBe(expected)
  })

  describe('identity', () => {
    it('requires an accountId', () => {
      expect(reason(validateRunRecord(record({ accountId: '' }), NOW))).toBe('missing_account')
      expect(reason(validateRunRecord(record({ accountId: 42 }), NOW))).toBe('missing_account')
    })

    it('caps accountId length', () => {
      expect(reason(validateRunRecord(record({ accountId: 'x'.repeat(129) }), NOW)))
        .toBe('account_too_long')
    })

    it('caps playerName length but allows it to be absent', () => {
      expect(reason(validateRunRecord(record({ playerName: 'x'.repeat(MAX_PLAYER_NAME + 1) }), NOW)))
        .toBe('player_name_too_long')
      expect(validateRunRecord(record({ playerName: null }), NOW)).toEqual({ ok: true })
    })
  })

  describe('timestamps', () => {
    it('rejects the placeholder timestamps a hand-written record tends to use', () => {
      // This is the shape that put a fake 1-second victory on the board.
      expect(reason(validateRunRecord(record({ startedAt: 1, endedAt: 1001 }), NOW)))
        .toBe('started_at_implausible')
    })

    it('requires startedAt', () => {
      expect(reason(validateRunRecord(record({ startedAt: undefined }), NOW)))
        .toBe('missing_started_at')
      expect(reason(validateRunRecord(record({ startedAt: NaN }), NOW)))
        .toBe('missing_started_at')
    })

    it('rejects a run that ended before it started', () => {
      expect(reason(validateRunRecord(record({ startedAt: NOW, endedAt: NOW - 1000 }), NOW)))
        .toBe('ended_before_started')
    })

    it('rejects timestamps beyond the clock-skew allowance', () => {
      const farFuture = NOW + 48 * HOUR
      expect(reason(validateRunRecord(record({ startedAt: farFuture, endedAt: farFuture }), NOW)))
        .toBe('started_at_future')
    })

    it('tolerates modest clock skew, since client clocks are not trustworthy', () => {
      const slightlyAhead = NOW + HOUR
      expect(validateRunRecord(
        record({ startedAt: slightlyAhead, endedAt: slightlyAhead, durationMs: 0 }), NOW,
      )).toEqual({ ok: true })
    })
  })

  describe('duration', () => {
    it('rejects a duration longer than the wall-clock span', () => {
      // durationMs is span minus paused time, so it can never exceed the span.
      expect(reason(validateRunRecord(record({ durationMs: HOUR + 1 }), NOW)))
        .toBe('duration_exceeds_span')
    })

    it('allows a duration shorter than the span, which is what pausing produces', () => {
      expect(validateRunRecord(record({ durationMs: 60_000 }), NOW)).toEqual({ ok: true })
    })

    it('rejects a negative duration', () => {
      expect(reason(validateRunRecord(record({ durationMs: -1 }), NOW))).toBe('negative_duration')
    })
  })

  describe('outcome and progress', () => {
    it('rejects an unknown outcome', () => {
      expect(reason(validateRunRecord(record({ outcome: 'ascended' }), NOW)))
        .toBe('unknown_outcome')
    })

    it.each(['victory', 'death', 'retired'])('accepts outcome %s', outcome => {
      const sigils = outcome === 'victory' ? SIGIL_TARGET : 3
      expect(validateRunRecord(record({ outcome, sigilsEarned: sigils }), NOW))
        .toEqual({ ok: true })
    })

    it('rejects more sigils than the target', () => {
      expect(reason(validateRunRecord(record({ sigilsEarned: SIGIL_TARGET + 1 }), NOW)))
        .toBe('sigils_above_target')
    })

    it('rejects a victory that did not reach the sigil target', () => {
      // A win is defined by reaching the target, so this cannot have happened.
      expect(reason(validateRunRecord(record({ outcome: 'victory', sigilsEarned: 0 }), NOW)))
        .toBe('victory_below_target')
    })

    it('honours a record-supplied sigilTarget, so old rulesets still validate', () => {
      expect(validateRunRecord(
        record({ outcome: 'victory', sigilsEarned: 7, sigilTarget: 7 }), NOW,
      )).toEqual({ ok: true })
    })
  })

  describe('game version', () => {
    it.each(VERSION_HISTORY)('accepts known version %s', v => {
      expect(validateRunRecord(record({ gameVersion: v }), NOW)).toEqual({ ok: true })
    })

    it('rejects a version that is not in VERSION_HISTORY', () => {
      expect(reason(validateRunRecord(record({ gameVersion: '99.9' }), NOW)))
        .toBe('unknown_game_version')
    })

    it('accepts a missing version, since legacy records predate the stamp', () => {
      expect(validateRunRecord(record({ gameVersion: null }), NOW)).toEqual({ ok: true })
    })
  })
})

describe('parseRunBatch', () => {
  it('accepts a single record and wraps it', () => {
    const result = parseRunBatch(record(), NOW)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(1)
  })

  it('accepts an array', () => {
    const result = parseRunBatch([record(), record({ startedAt: NOW - 2 * HOUR })], NOW)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(2)
  })

  it('caps the batch size', () => {
    const many = Array.from({ length: MAX_BATCH + 1 }, () => record())
    expect(reason(parseRunBatch(many, NOW))).toBe('batch_too_large')
  })

  it('accepts a batch exactly at the cap', () => {
    const many = Array.from({ length: MAX_BATCH }, () => record())
    expect(parseRunBatch(many, NOW).ok).toBe(true)
  })

  it('keeps the valid records in a mixed batch', () => {
    // A resend queue the client cannot repair entry-by-entry must not be
    // discarded wholesale because one entry is bad.
    const result = parseRunBatch([record(), { junk: true }, record({ outcome: 'retired' })], NOW)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(2)
  })

  it('rejects a batch with nothing valid in it', () => {
    expect(reason(parseRunBatch([{ junk: true }, null], NOW))).toBe('no_valid_records')
  })

  it('rejects an empty array', () => {
    expect(reason(parseRunBatch([], NOW))).toBe('empty_batch')
  })
})

describe('mayWriteAs', () => {
  it('lets guests write with no session', () => {
    expect(mayWriteAs('guest', null)).toBe(true)
  })

  it('refuses a real account with no session', () => {
    expect(mayWriteAs('google-sub-123', null)).toBe(false)
  })

  it('refuses a session for a different account', () => {
    // The impersonation case: posting under someone else's id.
    expect(mayWriteAs('google-sub-123', { sub: 'google-sub-456' })).toBe(false)
  })

  it('allows a matching session', () => {
    expect(mayWriteAs('google-sub-123', { sub: 'google-sub-123' })).toBe(true)
  })

  it('refuses a session payload with no sub', () => {
    expect(mayWriteAs('google-sub-123', { email: 'a@b.c' })).toBe(false)
  })
})
