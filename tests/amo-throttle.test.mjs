import { describe, expect, it } from 'vitest'
import {
  createThrottleLedger,
  planThrottledSend,
  scopeFor,
  SUBMISSION_WINDOWS,
  UNTHROTTLED,
} from '../scripts/amo-throttle.mjs'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('scopeFor', () => {
  // Safe methods do not count, and this script makes several: the credential
  // check, the validation poll, and the read that supplies the preview list.
  // Billing them would pace the run against calls AMO never charged for.
  it('does not charge reads', () => {
    expect(scopeFor('GET', '/accounts/profile/')).toBe('read')
    expect(scopeFor('GET', '/addons/upload/abc/')).toBe('read')
    expect(scopeFor('GET', '/addons/addon/guid/')).toBe('read')
  })

  it('bills package uploads to their own scope', () => {
    expect(scopeFor('POST', '/addons/upload/')).toBe('upload')
  })

  // Every unsafe call on the add-on record shares one budget: the listing PUT,
  // the version PATCH, the icon PATCH, and all three preview calls.
  it('bills every write on the add-on record to the submission scope', () => {
    expect(scopeFor('PUT', '/addons/addon/guid/')).toBe('submission')
    expect(scopeFor('PATCH', '/addons/addon/guid/')).toBe('submission')
    expect(scopeFor('PATCH', '/addons/addon/guid/versions/1/')).toBe(
      'submission',
    )
    expect(scopeFor('POST', '/addons/addon/guid/previews/')).toBe('submission')
    expect(scopeFor('PATCH', '/addons/addon/guid/previews/9/')).toBe(
      'submission',
    )
    expect(scopeFor('DELETE', '/addons/addon/guid/previews/9/')).toBe(
      'submission',
    )
  })
})

describe('planThrottledSend', () => {
  it('sends immediately with budget to spare', () => {
    expect(planThrottledSend(SUBMISSION_WINDOWS, [], 0)).toEqual({
      waitMs: 0,
      reason: null,
    })
    expect(
      planThrottledSend(SUBMISSION_WINDOWS, [0, 1, 2], 10 * MINUTE),
    ).toEqual({ waitMs: 0, reason: null })
  })

  // The wait is measured from the oldest send still inside the window, not from
  // now: that is the one whose expiry makes room.
  it('waits out the per-minute window from the send that frees it', () => {
    const now = 30_000
    const { waitMs, reason } = planThrottledSend(
      SUBMISSION_WINDOWS,
      [0, 10_000, 20_000],
      now,
    )

    expect(waitMs).toBe(30_000)
    expect(reason).toBe('3/minute')
  })

  // DRF applies every window at once, so a run that is inside the minute limit
  // can still be blocked for most of an hour. Reporting the shorter one would
  // send a request that comes back 429.
  it('reports the longest window when more than one is full', () => {
    const sentAt = Array.from({ length: 10 }, (_, index) => index * MINUTE)
    const { waitMs, reason } = planThrottledSend(
      SUBMISSION_WINDOWS,
      sentAt,
      10 * MINUTE,
    )

    expect(reason).toBe('10/hour')
    // The oldest of the ten is at 0, so the window frees an hour after it.
    expect(waitMs).toBe(HOUR - 10 * MINUTE)
  })

  it('never paces a scope with no modelled windows', () => {
    const sentAt = Array.from({ length: 50 }, () => 0)

    expect(planThrottledSend(UNTHROTTLED, sentAt, 0)).toEqual({
      waitMs: 0,
      reason: null,
    })
  })
})

describe('the ledger', () => {
  // The property that matters is not the shape of the waits, it is that no
  // send is ever made into a full window. Asserting a particular sequence would
  // only restate the implementation; this restates the limit.
  it('never sends into a window AMO would reject', () => {
    let clock = 0
    const ledger = createThrottleLedger(() => clock)
    const sends = []

    // Two calls per image plus a delete each is what a five-screenshot sync
    // costs, which is well past the per-minute limit on its own.
    for (let call = 0; call < 15; call += 1) {
      clock += ledger.plan('submission').waitMs
      sends.push(clock)
      ledger.record('submission')
    }

    SUBMISSION_WINDOWS.forEach(({ limit, windowMs, label }) => {
      sends.forEach(at => {
        const concurrent = sends.filter(
          other => other <= at && at - other < windowMs,
        )

        expect(concurrent.length, `${label} at ${at}ms`).toBeLessThanOrEqual(
          limit,
        )
      })
    })

    expect(ledger.sent('submission')).toBe(15)
  })

  it('lets the budget refill rather than pacing forever', () => {
    let clock = 0
    const ledger = createThrottleLedger(() => clock)

    for (let call = 0; call < 3; call += 1) {
      ledger.record('submission')
    }

    clock += ledger.plan('submission').waitMs
    ledger.record('submission')

    // Waiting out the minute window frees the whole minute, not one slot.
    expect(ledger.plan('submission').waitMs).toBe(0)
  })

  // A rejected request still spends budget on the windows it did not violate,
  // so the caller records every send rather than only the successful ones.
  it('counts a send whether or not AMO accepted it', () => {
    let clock = 0
    const ledger = createThrottleLedger(() => clock)

    ledger.record('submission')
    ledger.record('submission')
    ledger.record('submission')

    expect(ledger.plan('submission').waitMs).toBe(60_000)
  })

  it('forgets sends that have aged out of every window', () => {
    let clock = 0
    const ledger = createThrottleLedger(() => clock)

    ledger.record('submission')
    clock = 25 * 60 * 60_000
    ledger.record('submission')

    expect(ledger.sent('submission')).toBe(1)
  })

  it('tracks nothing for an unmodelled scope', () => {
    const ledger = createThrottleLedger(() => 0)

    ledger.record('upload')
    ledger.record('read')

    expect(ledger.sent('upload')).toBe(0)
    expect(ledger.plan('upload').waitMs).toBe(0)
  })
})
