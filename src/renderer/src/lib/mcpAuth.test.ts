import { describe, it, expect } from 'vitest'
import { authState } from './mcpAuth'

describe('authState', () => {
  // The trap this function is built around: "not authorized" contains
  // "authorized". A positive test placed first reports an unauthorized server as
  // authorized — the exact opposite of the truth, on a security question.
  it.each([
    'not authorized', 'Not Authorized', 'unauthorized', 'unauthorised',
    'authorization required', 'auth required', 'pending', 'needs auth', 'no', 'none', 'never'
  ])('reads %o as not authorized', (input) => {
    expect(authState(input)).toEqual({ label: 'Not authorized', tone: 'warn' })
  })

  it.each(['authorized', 'Authorized', 'ok', 'yes', 'valid', 'active', 'connected'])(
    'reads %o as authorized', (input) => {
      expect(authState(input)).toEqual({ label: 'Authorized', tone: 'ok' })
    })

  it.each(['expired', 'invalid', 'token failed', 'revoked'])(
    'reads %o as needing reauthorization', (input) => {
      expect(authState(input)).toEqual({ label: 'Reauthorize', tone: 'warn' })
    })

  // `OAuth: required` is a capability — it reads the same before and after you
  // authorize — so it must produce no badge rather than a false verdict.
  it.each(['required', 'optional', 'supported', 'enabled', 'disabled'])(
    'treats the capability word %o as no state at all', (input) => {
      expect(authState(input)).toEqual({ label: '', tone: 'none' })
    })

  it('says nothing when sbx said nothing', () => {
    expect(authState('')).toEqual({ label: '', tone: 'none' })
  })

  it('shows an unrecognised value verbatim instead of swallowing it', () => {
    // Silence is what made an authorized server look like it had never been
    // authorized, so an odd badge is the better failure.
    expect(authState('weird-new-state')).toEqual({ label: 'weird-new-state', tone: 'none' })
  })

  it('truncates a long unrecognised value', () => {
    const r = authState('x'.repeat(60))
    expect(r.label).toHaveLength(24)
    expect(r.label.endsWith('…')).toBe(true)
  })
})
