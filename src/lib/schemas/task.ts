import { z } from 'zod'
import { prioritySchema, DEFAULT_PRIORITY } from './priority'

export const TASK_STATUSES = ['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'DROPPED'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const taskStatusSchema = z.enum(TASK_STATUSES)

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

// Client-controlled fields for creating a task.
// Status, timestamps, priority_weight are deliberately absent — server-controlled.
export const taskCreateInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: prioritySchema.default(DEFAULT_PRIORITY),
  project_id: z.uuid().optional().nullable(),
  due_date: dateString.optional().nullable(),
  tag_ids: z.array(z.uuid()).default([]),
})
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>

// Patch input: id + any subset of editable fields. Nullable = "clear this field".
export const taskUpdateInputSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  priority: prioritySchema.optional(),
  project_id: z.uuid().nullable().optional(),
  due_date: dateString.nullable().optional(),
  tag_ids: z.array(z.uuid()).optional(),
})
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>

// Status change is its own input — it triggers lifecycle timestamp logic server-side.
export const changeTaskStatusInput = z.object({
  id: z.uuid(),
  status: taskStatusSchema,
})
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusInput>

// List/filter query (DESIGN.md §4.2, §4.3).
export const taskListQuerySchema = z.object({
  status: z.union([taskStatusSchema, z.array(taskStatusSchema)]).optional(),
  priority: z.union([prioritySchema, z.array(prioritySchema)]).optional(),
  project_id: z.uuid().optional(),
  tag_id: z.union([z.uuid(), z.array(z.uuid())]).optional(),
  due_before: dateString.optional(),
  due_after: dateString.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, 100))
    .default(50),
  sort: z.enum(['priority', 'due', 'created']).default('priority'),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
