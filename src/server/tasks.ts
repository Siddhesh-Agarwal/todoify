import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql, lte, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { task, task_tags, project, tag } from '@/lib/db/schema'
import { requireUserId } from './session'
import { findProjectByName } from './projects'
import { findTagByName } from './tags'
import { priorityToWeight, prioritySchema, DEFAULT_PRIORITY } from '@/lib/schemas/priority'
import {
  taskCreateInputSchema,
  taskUpdateInputSchema,
  taskListQuerySchema,
  changeTaskStatusInput,
  type TaskStatus,
} from '@/lib/schemas/task'
import { toFtsQuery } from '@/lib/fts'

export const getTask = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .select()
      .from(task)
      .where(and(eq(task.id, data.id), eq(task.owner_id, userId), eq(task.is_trashed, false)))
    if (!row) throw new Error('Not found')
    return row
  })

export const listTasks = createServerFn({ method: 'GET' })
  .validator(taskListQuerySchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    const conds = [eq(task.owner_id, userId), eq(task.is_trashed, false)]
    if (data.status) {
      const statuses = Array.isArray(data.status) ? data.status : [data.status]
      conds.push(inArray(task.status, statuses))
    }
    if (data.priority) {
      const ps = Array.isArray(data.priority) ? data.priority : [data.priority]
      conds.push(inArray(task.priority, ps))
    }
    if (data.project_id) conds.push(eq(task.project_id, data.project_id))
    if (data.tag_id) {
      const tagIds = Array.isArray(data.tag_id) ? data.tag_id : [data.tag_id]
      conds.push(
        inArray(
          task.id,
          db.select({ id: task_tags.task_id }).from(task_tags).where(inArray(task_tags.tag_id, tagIds)),
        ),
      )
    }
    if (data.due_before) conds.push(lte(task.due_date, data.due_before))
    if (data.due_after) conds.push(gte(task.due_date, data.due_after))
    if (data.search) {
      const fts = toFtsQuery(data.search)
      if (fts) conds.push(sql`rowid IN (SELECT rowid FROM task_fts WHERE task_fts MATCH ${fts})`)
    }

    const where = and(...conds)
    const offset = (data.page - 1) * data.pageSize

    const orderBy =
      data.sort === 'due'
        ? [sql`${task.due_date} ASC NULLS LAST`, desc(task.priority_weight)]
        : data.sort === 'created'
        ? [desc(task.created_at)]
        : [desc(task.priority_weight), sql`${task.due_date} ASC NULLS LAST`]

    const items = await db
      .select()
      .from(task)
      .where(where)
      .orderBy(...orderBy)
      .limit(data.pageSize)
      .offset(offset)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(task)
      .where(where)

    return { items, total: count, page: data.page, pageSize: data.pageSize }
  })

export const listTrash = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).transform((v) => Math.min(v, 100)).default(50),
      })
      .optional(),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const opts = data ?? { page: 1, pageSize: 50 }
    const where = and(eq(task.owner_id, userId), eq(task.is_trashed, true))
    const offset = (opts.page - 1) * opts.pageSize
    const items = await db
      .select()
      .from(task)
      .where(where)
      .orderBy(desc(task.trashed_at))
      .limit(opts.pageSize)
      .offset(offset)
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(task)
      .where(where)
    return { items, total: count, page: opts.page, pageSize: opts.pageSize }
  })

export const createTask = createServerFn({ method: 'POST' })
  .validator(taskCreateInputSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const id = crypto.randomUUID()
    const stmts: any[] = [
      db.insert(task).values({
        id,
        title: data.title,
        description: data.description ?? null,
        status: 'PLANNING',
        priority: data.priority,
        priority_weight: priorityToWeight(data.priority),
        project_id: data.project_id ?? null,
        due_date: data.due_date ?? null,
        owner_id: userId,
        is_trashed: false,
      }),
    ]
    if (data.tag_ids.length > 0) {
      stmts.push(
        db.insert(task_tags).values(data.tag_ids.map((tag_id) => ({ task_id: id, tag_id }))),
      )
    }
    await db.batch(stmts as any)
    const [created] = await db.select().from(task).where(eq(task.id, id))
    return created
  })

// Quick-add path: resolve project (by name, create if missing) + tags
// (get-or-create) server-side, then write task + new project + new tags + tag
// links in one atomic db.batch(). Input shape matches ParsedQuickAdd minus warnings.
const quickAddCreateInput = z.object({
  title: z.string().min(1).max(200),
  projectName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  priority: prioritySchema.default(DEFAULT_PRIORITY),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const createTaskFromQuickAdd = createServerFn({ method: 'POST' })
  .validator(quickAddCreateInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    // 1) Resolve project (case-insensitive by name); mark new ones for creation.
    let projectId: string | null = null
    let projectIsNew = false
    if (data.projectName) {
      const existing = await findProjectByName(db, userId, data.projectName)
      if (existing) {
        projectId = existing.id
      } else {
        projectId = crypto.randomUUID()
        projectIsNew = true
      }
    }

    // 2) Resolve tags: existing by name, generate ids for the rest.
    const tagNames = [...new Set(data.tags)]
    const existingTags = tagNames.length
      ? await Promise.all(tagNames.map((n) => findTagByName(db, userId, n)))
      : []
    const existingByName = new Map<string, string>()
    tagNames.forEach((n, i) => {
      const r = existingTags[i]
      if (r) existingByName.set(n, r.id)
    })
    const newTagIds: Record<string, string> = {}
    for (const n of tagNames) if (!existingByName.has(n)) newTagIds[n] = crypto.randomUUID()
    const tagIds = tagNames.map((n) => existingByName.get(n) ?? newTagIds[n]!)

    // 3) Atomic batch. Order respects FKs (D1 checks per-statement even inside
    //    a batch): new project -> task -> new tags -> tag links.
    const taskId = crypto.randomUUID()
    const stmts: any[] = []
    if (projectIsNew && projectId) {
      stmts.push(
        db.insert(project).values({
          id: projectId,
          name: data.projectName!,
          owner_id: userId,
          archived: false,
        }),
      )
    }
    stmts.push(
      db.insert(task).values({
        id: taskId,
        title: data.title,
        status: 'PLANNING',
        priority: data.priority,
        priority_weight: priorityToWeight(data.priority),
        project_id: projectId,
        due_date: data.dueDate ?? null,
        owner_id: userId,
        is_trashed: false,
      }),
    )
    const tagsToCreate = Object.entries(newTagIds)
    if (tagsToCreate.length > 0) {
      stmts.push(
        db.insert(tag).values(tagsToCreate.map(([name, id]) => ({ id, name, owner_id: userId }))),
      )
    }
    if (tagIds.length > 0) {
      stmts.push(
        db.insert(task_tags).values(tagIds.map((tag_id) => ({ task_id: taskId, tag_id }))),
      )
    }
    await db.batch(stmts as any)

    const [created] = await db.select().from(task).where(eq(task.id, taskId))
    return created
  })

export const updateTask = createServerFn({ method: 'POST' })
  .validator(taskUpdateInputSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const { id, ...patch } = data

    const [existing] = await db
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.id, id), eq(task.owner_id, userId), eq(task.is_trashed, false)))
    if (!existing) throw new Error('Not found')

    const set: Record<string, unknown> = { updated_at: sql`CURRENT_TIMESTAMP` }
    if (patch.title !== undefined) set.title = patch.title
    if (patch.description !== undefined) set.description = patch.description
    if (patch.priority !== undefined) {
      set.priority = patch.priority
      set.priority_weight = priorityToWeight(patch.priority)
    }
    if (patch.project_id !== undefined) set.project_id = patch.project_id
    if (patch.due_date !== undefined) set.due_date = patch.due_date

    const stmts: any[] = [db.update(task).set(set as any).where(eq(task.id, id))]
    if (patch.tag_ids !== undefined) {
      stmts.push(db.delete(task_tags).where(eq(task_tags.task_id, id)))
      if (patch.tag_ids.length > 0) {
        stmts.push(
          db.insert(task_tags).values(patch.tag_ids.map((tag_id) => ({ task_id: id, tag_id }))),
        )
      }
    }
    await db.batch(stmts as any)

    const [updated] = await db.select().from(task).where(eq(task.id, id))
    return updated
  })

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PLANNING: ['IN_PROGRESS', 'DROPPED'],
  IN_PROGRESS: ['COMPLETED', 'DROPPED', 'PLANNING'],
  COMPLETED: ['PLANNING'],
  DROPPED: ['PLANNING'],
}

export const changeTaskStatus = createServerFn({ method: 'POST' })
  .validator(changeTaskStatusInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [existing] = await db
      .select()
      .from(task)
      .where(and(eq(task.id, data.id), eq(task.owner_id, userId), eq(task.is_trashed, false)))
    if (!existing) throw new Error('Not found')

    const from = existing.status as TaskStatus
    const to = data.status
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`Invalid status transition: ${from} -> ${to}`)
    }

    const set: Record<string, unknown> = { status: to, updated_at: sql`CURRENT_TIMESTAMP` }
    if (to === 'IN_PROGRESS' && !existing.started_at) {
      set.started_at = sql`CURRENT_TIMESTAMP`
    }
    if (to === 'COMPLETED' || to === 'DROPPED') {
      set.completed_at = sql`CURRENT_TIMESTAMP`
    }
    if (to === 'PLANNING') {
      set.completed_at = null // reopen clears completed_at (DESIGN §3)
    }
    await db.update(task).set(set as any).where(eq(task.id, data.id))
    const [updated] = await db.select().from(task).where(eq(task.id, data.id))
    return updated
  })

export const trashTask = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .update(task)
      .set({ is_trashed: true, trashed_at: sql`CURRENT_TIMESTAMP`, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(task.id, data.id), eq(task.owner_id, userId)))
    return { id: data.id, is_trashed: true }
  })

export const restoreTask = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .update(task)
      .set({ is_trashed: false, trashed_at: null, updated_at: sql`CURRENT_TIMESTAMP` })
      .where(and(eq(task.id, data.id), eq(task.owner_id, userId), eq(task.is_trashed, true)))
    return { id: data.id, is_trashed: false }
  })
