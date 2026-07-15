import { describe, it, expect } from 'vitest'
import {
  taskStatusSchema,
  taskCreateInputSchema,
  taskUpdateInputSchema,
  changeTaskStatusInput,
  taskListQuerySchema,
  TASK_STATUSES,
} from './task'

describe('taskStatusSchema', () => {
  it('accepts the four lifecycle statuses', () => {
    expect(TASK_STATUSES).toEqual(['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'DROPPED'])
    for (const s of TASK_STATUSES) {
      expect(taskStatusSchema.safeParse(s).success).toBe(true)
    }
  })
  it('rejects unknown statuses', () => {
    expect(taskStatusSchema.safeParse('DONE').success).toBe(false)
  })
})

describe('taskCreateInputSchema', () => {
  it('defaults priority to P2 and tag_ids to [] when omitted', () => {
    const parsed = taskCreateInputSchema.parse({ title: 'Write tests' })
    expect(parsed.priority).toBe('P2')
    expect(parsed.tag_ids).toEqual([])
  })
  it('requires a non-empty title', () => {
    expect(taskCreateInputSchema.safeParse({ title: '' }).success).toBe(false)
    expect(taskCreateInputSchema.safeParse({}).success).toBe(false)
  })
  it('accepts optional description, project_id, due_date, tag_ids', () => {
    const parsed = taskCreateInputSchema.parse({
      title: 'Ship it',
      description: 'body',
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      due_date: '2026-08-01',
      tag_ids: ['123e4567-e89b-12d3-a456-426614174001'],
    })
    expect(parsed.title).toBe('Ship it')
    expect(parsed.due_date).toBe('2026-08-01')
  })
  it('rejects a malformed due_date', () => {
    expect(
      taskCreateInputSchema.safeParse({ title: 'x', due_date: 'Aug 1' }).success,
    ).toBe(false)
  })
  it('rejects a non-uuid project_id', () => {
    expect(
      taskCreateInputSchema.safeParse({ title: 'x', project_id: 'not-a-uuid' }).success,
    ).toBe(false)
  })
})

describe('taskUpdateInputSchema', () => {
  it('requires an id and allows all other fields to be omitted', () => {
    const parsed = taskUpdateInputSchema.parse({ id: '123e4567-e89b-12d3-a456-426614174000' })
    expect(parsed.id).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(parsed.title).toBeUndefined()
  })
  it('requires id to be a uuid', () => {
    expect(taskUpdateInputSchema.safeParse({ id: 'nope' }).success).toBe(false)
  })
  it('accepts nullable project_id and due_date to clear them', () => {
    const parsed = taskUpdateInputSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      project_id: null,
      due_date: null,
    })
    expect(parsed.project_id).toBeNull()
    expect(parsed.due_date).toBeNull()
  })
})

describe('changeTaskStatusInput', () => {
  it('requires an id + a valid status', () => {
    expect(
      changeTaskStatusInput.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'IN_PROGRESS',
      }).success,
    ).toBe(true)
    expect(
      changeTaskStatusInput.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'ARCHIVED',
      }).success,
    ).toBe(false)
  })
})

describe('taskListQuerySchema', () => {
  it('defaults page=1, pageSize=50, sort=priority', () => {
    const parsed = taskListQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(50)
    expect(parsed.sort).toBe('priority')
  })
  it('coerces string page numbers', () => {
    const parsed = taskListQuerySchema.parse({ page: '3', pageSize: '10' })
    expect(parsed.page).toBe(3)
    expect(parsed.pageSize).toBe(10)
  })
  it('accepts single or array status/priority/tag filters', () => {
    const a = taskListQuerySchema.parse({ status: 'IN_PROGRESS' })
    const b = taskListQuerySchema.parse({ status: ['PLANNING', 'IN_PROGRESS'] })
    expect(a.status).toBe('IN_PROGRESS')
    expect(b.status).toEqual(['PLANNING', 'IN_PROGRESS'])
  })
  it('caps pageSize at 100', () => {
    expect(taskListQuerySchema.parse({ pageSize: 999 }).pageSize).toBe(100)
  })
})
