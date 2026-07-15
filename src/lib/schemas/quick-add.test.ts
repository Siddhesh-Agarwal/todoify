import { describe, it, expect } from 'vitest'
import { parseQuickAdd } from './quick-add'

function dateOffset(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('parseQuickAdd — DESIGN.md example', () => {
  it('parses the canonical example correctly', () => {
    const result = parseQuickAdd('Fix login race condition #auth-service @bug @urgent P0 due:+1')
    expect(result.title).toBe('Fix login race condition')
    expect(result.projectName).toBe('auth-service')
    expect(result.tags).toEqual(['bug', 'urgent'])
    expect(result.priority).toBe('P0')
    expect(result.dueDate).toBe(dateOffset(1))
    expect(result.warnings).toEqual([])
  })
})

describe('parseQuickAdd — defaults', () => {
  it('defaults priority to P2 when no P-token present', () => {
    expect(parseQuickAdd('just a title').priority).toBe('P2')
  })
  it('has no project/tags/due when none present', () => {
    const r = parseQuickAdd('just a title')
    expect(r.projectName).toBeUndefined()
    expect(r.tags).toEqual([])
    expect(r.dueDate).toBeUndefined()
  })
})

describe('parseQuickAdd — priority last-wins', () => {
  it('uses the last P-token when repeated', () => {
    expect(parseQuickAdd('thing P1 P3').priority).toBe('P3')
  })
  it('does not match P inside a word like HTTP0', () => {
    const r = parseQuickAdd('upgrade HTTP0 module')
    expect(r.priority).toBe('P2')
    expect(r.title).toBe('upgrade HTTP0 module')
  })
})

describe('parseQuickAdd — due date', () => {
  it('due:+0 means today', () => {
    expect(parseQuickAdd('x due:+0').dueDate).toBe(dateOffset(0))
  })
  it('due:+3 is three days out', () => {
    expect(parseQuickAdd('x due:+3').dueDate).toBe(dateOffset(3))
  })
})

describe('parseQuickAdd — project', () => {
  it('takes the first #project and warns on extras', () => {
    const r = parseQuickAdd('x #alpha #beta')
    expect(r.projectName).toBe('alpha')
    expect(r.warnings.length).toBe(1)
    expect(r.warnings[0]).toMatch(/Multiple #project/)
  })
})

describe('parseQuickAdd — tags', () => {
  it('collects multiple @tags in order', () => {
    expect(parseQuickAdd('x @a @b @c').tags).toEqual(['a', 'b', 'c'])
  })
  it('keeps tags even with a project and priority', () => {
    const r = parseQuickAdd('Do thing #proj @t1 P1 @t2')
    expect(r.tags).toEqual(['t1', 't2'])
    expect(r.projectName).toBe('proj')
    expect(r.priority).toBe('P1')
    expect(r.title).toBe('Do thing')
  })
})

describe('parseQuickAdd — title', () => {
  it('collapses leftover whitespace', () => {
    expect(parseQuickAdd('hello   world').title).toBe('hello world')
  })
  it('strips tokens but keeps the rest as title', () => {
    expect(parseQuickAdd('fix the bug in module P2').title).toBe('fix the bug in module')
  })
})

describe('parseQuickAdd — malformed input', () => {
  it('warns and drops a non-numeric due, still parses the task', () => {
    const r = parseQuickAdd('x due:+abc')
    expect(r.dueDate).toBeUndefined()
    expect(r.warnings.length).toBe(1)
    expect(r.title).toBe('x')
  })
  it('empty string yields empty title', () => {
    expect(parseQuickAdd('').title).toBe('')
  })
})

describe('parseQuickAdd — trailing punctuation', () => {
  it('strips trailing punctuation from project name', () => {
    expect(parseQuickAdd('do thing #proj, then rest').projectName).toBe('proj')
  })
  it('strips trailing punctuation from tag names', () => {
    expect(parseQuickAdd('fix bug @bug. end').tags).toEqual(['bug'])
  })
})

describe('parseQuickAdd — multiple due tokens', () => {
  it('uses the first due and warns on extras', () => {
    const r = parseQuickAdd('x due:+1 due:+3')
    expect(r.dueDate).toBe(dateOffset(1))
    expect(r.warnings.length).toBe(1)
    expect(r.title).toBe('x')
  })
})
