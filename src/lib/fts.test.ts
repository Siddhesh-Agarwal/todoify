import { describe, it, expect } from 'vitest'
import { toFtsQuery } from './fts'

describe('toFtsQuery', () => {
  it('returns empty string for blank input', () => {
    expect(toFtsQuery('')).toBe('')
    expect(toFtsQuery('   ')).toBe('')
  })
  it('quotes each whitespace-separated token', () => {
    expect(toFtsQuery('login race')).toBe('"login" "race"')
  })
  it('quotes a single token', () => {
    expect(toFtsQuery('login')).toBe('"login"')
  })
  it('neutralizes FTS5 operators by quoting them literally', () => {
    // NEAR is an operator only outside quotes; inside quotes it is literal text.
    expect(toFtsQuery('NEAR (a, b)')).toBe('"NEAR" "(a," "b)"')
  })
  it('strips quote and star chars so they cannot break out of the literal', () => {
    expect(toFtsQuery('a"b*c')).toBe('"a b c"')
  })
  it('collapses extra whitespace between tokens', () => {
    expect(toFtsQuery('a   b')).toBe('"a" "b"')
  })
})
