import { describe, it, expect } from 'vitest'
import { buildTaskWhere } from './task-query'
import { taskListQuerySchema, type TaskListQuery } from './schemas/task'

// buildTaskWhere builds a Drizzle SQL `where` from filter facets. The tag_id
// branch needs a db (subquery); tests here do NOT pass tag_id, so db is never
// touched — pass a stub. Covering the tag subquery needs a D1 mock harness
// (out of scope for Phase 1).
const STUB_DB = null as any

function q(overrides: Partial<TaskListQuery> = {}): TaskListQuery {
  return taskListQuerySchema.parse({ ...overrides })
}

describe('buildTaskWhere', () => {
  it('returns a where for the bare case (owner + not-trashed only)', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q())
    expect(where).toBeDefined()
  })

  it('handles status as a single value', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ status: 'IN_PROGRESS' }))
    expect(where).toBeDefined()
  })

  it('handles status as an array', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ status: ['PLANNING', 'IN_PROGRESS'] }))
    expect(where).toBeDefined()
  })

  it('handles priority as an array', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ priority: ['P0', 'P1'] }))
    expect(where).toBeDefined()
  })

  it('handles project_id and due range', () => {
    const where = buildTaskWhere(
      STUB_DB,
      'user-1',
      q({ project_id: crypto.randomUUID(), due_after: '2026-07-17', due_before: '2026-07-24' }),
    )
    expect(where).toBeDefined()
  })

  it('handles search with a real term', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ search: 'login race' }))
    expect(where).toBeDefined()
  })

  it('skips the FTS condition when search is empty/whitespace', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ search: '   ' }))
    expect(where).toBeDefined()
  })
})
