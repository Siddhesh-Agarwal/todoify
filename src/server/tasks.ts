import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, sql, lte, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { task, task_tags } from '@/lib/db/schema'
import { requireUserId } from './session'
import { taskListQuerySchema } from '@/lib/schemas/task'
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
