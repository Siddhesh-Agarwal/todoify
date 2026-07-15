import { describe, it, expect } from 'vitest'
import {
  PRIORITY_WEIGHTS,
  PRIORITY_LEVELS,
  DEFAULT_PRIORITY,
  prioritySchema,
  priorityToWeight,
} from './priority'

describe('PRIORITY_WEIGHTS', () => {
  it('matches DESIGN.md §4.4 exactly', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      P0: 100,
      P1: 75,
      P2: 50,
      P3: 25,
      P4: 10,
    })
  })

  it('lists levels P0..P4 in order', () => {
    expect(PRIORITY_LEVELS).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })
})

describe('priorityToWeight', () => {
  it('returns the stored weight for each level', () => {
    expect(priorityToWeight('P0')).toBe(100)
    expect(priorityToWeight('P1')).toBe(75)
    expect(priorityToWeight('P2')).toBe(50)
    expect(priorityToWeight('P3')).toBe(25)
    expect(priorityToWeight('P4')).toBe(10)
  })
})

describe('DEFAULT_PRIORITY', () => {
  it('is P2 (DESIGN §4.4)', () => {
    expect(DEFAULT_PRIORITY).toBe('P2')
  })
})

describe('prioritySchema', () => {
  it('accepts P0 through P4', () => {
    for (const p of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      expect(prioritySchema.safeParse(p).success).toBe(true)
    }
  })
  it('rejects P5, lowercase, and bare P', () => {
    expect(prioritySchema.safeParse('P5').success).toBe(false)
    expect(prioritySchema.safeParse('p0').success).toBe(false)
    expect(prioritySchema.safeParse('P').success).toBe(false)
    expect(prioritySchema.safeParse('').success).toBe(false)
  })
})
