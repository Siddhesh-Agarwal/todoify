import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { task, task_tags, tag } from '@/lib/db/schema'
import { requireUserId } from './session.server'
import { taskStatusSchema } from '@/lib/schemas/task'

const idsSchema = z.object({
  task_ids: z.array(z.uuid()).min(1).max(500),
})

// Bulk status change. Applies the same lifecycle timestamp rules as
// changeTaskStatus, computed per-row from each task's current state.
export const bulkChangeStatus = createServerFn({ method: 'POST' })
  .validator(idsSchema.extend({ status: taskStatusSchema }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const rows = await db
      .select()
      .from(task)
      .where(
        and(
          eq(task.owner_id, userId),
          eq(task.is_trashed, false),
          inArray(task.id, data.task_ids),
        ),
      )
    if (rows.length === 0) return { updated: 0 }

    const allowed: Record<string, string[]> = {
      PLANNING: ['IN_PROGRESS', 'DROPPED'],
      IN_PROGRESS: ['COMPLETED', 'DROPPED', 'PLANNING'],
      COMPLETED: ['PLANNING'],
      DROPPED: ['PLANNING'],
    }
    const to = data.status
    const stmts: any[] = []
    for (const row of rows) {
      const from = row.status
      if (!allowed[from]?.includes(to)) continue
      const set: Record<string, unknown> = { status: to, updated_at: sql`CURRENT_TIMESTAMP` }
      if (to === 'IN_PROGRESS' && !row.started_at) set.started_at = sql`CURRENT_TIMESTAMP`
      if (to === 'COMPLETED' || to === 'DROPPED') set.completed_at = sql`CURRENT_TIMESTAMP`
      if (to === 'PLANNING') set.completed_at = null
      stmts.push(db.update(task).set(set as any).where(eq(task.id, row.id)))
    }
    if (stmts.length > 0) await db.batch(stmts as any)
    return { updated: stmts.length }
  })

// Bulk trash: soft-delete many tasks in one atomic batch.
export const bulkTrash = createServerFn({ method: 'POST' })
  .validator(idsSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const stmts = data.task_ids.map((id) =>
      db
        .update(task)
        .set({
          is_trashed: true,
          trashed_at: sql`CURRENT_TIMESTAMP`,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(task.id, id), eq(task.owner_id, userId), eq(task.is_trashed, false))),
    )
    await db.batch(stmts as any)
    return { trashed: data.task_ids.length }
  })

// Bulk add tags: resolve each tag name to an id (get-or-create), then insert
// the missing task-tag links in one batch (existing links are skipped).
export const bulkAddTags = createServerFn({ method: 'POST' })
  .validator(idsSchema.extend({ tag_names: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    // Dedupe tag names (preserve first occurrence) to avoid duplicate inserts.
    const tagNames = [...new Set(data.tag_names)]

    // Resolve tag ids (get-or-create by name).
    const existing = await db
      .select({ id: tag.id, name: tag.name })
      .from(tag)
      .where(and(eq(tag.owner_id, userId), inArray(tag.name, tagNames)))
    const byName = new Map(existing.map((t) => [t.name, t.id]))
    const toCreate = tagNames.filter((n) => !byName.has(n))
    const newIds: Record<string, string> = {}
    for (const n of toCreate) newIds[n] = crypto.randomUUID()

    // Existing links to skip (so we don't re-insert duplicates).
    const allTagIds = tagNames.map((n) => byName.get(n) ?? newIds[n]!)
    const alreadyLinked = await db
      .select({ task_id: task_tags.task_id, tag_id: task_tags.tag_id })
      .from(task_tags)
      .where(
        and(
          inArray(task_tags.task_id, data.task_ids),
          inArray(task_tags.tag_id, allTagIds),
        ),
      )
    const linkedSet = new Set(alreadyLinked.map((r) => `${r.task_id}|${r.tag_id}`))

    const stmts: any[] = []
    for (const [name, id] of Object.entries(newIds)) {
      stmts.push(db.insert(tag).values({ id, name, owner_id: userId }))
    }
    for (const taskId of data.task_ids) {
      for (const tagId of allTagIds) {
        if (linkedSet.has(`${taskId}|${tagId}`)) continue
        stmts.push(db.insert(task_tags).values({ task_id: taskId, tag_id: tagId }))
      }
    }
    if (stmts.length > 0) await db.batch(stmts as any)
    return { added: stmts.length }
  })

// Bulk remove tags: delete all matching task-tag links in one batch.
export const bulkRemoveTags = createServerFn({ method: 'POST' })
  .validator(idsSchema.extend({ tag_ids: z.array(z.uuid()).min(1) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    // Only remove links on tasks owned by the user (join to filter owner).
    const ownedTaskIds = await db
      .select({ id: task.id })
      .from(task)
      .where(and(eq(task.owner_id, userId), inArray(task.id, data.task_ids)))
    if (ownedTaskIds.length === 0) return { removed: 0 }
    const ownedIds = ownedTaskIds.map((r) => r.id)
    await db
      .delete(task_tags)
      .where(
        and(
          inArray(task_tags.task_id, ownedIds),
          inArray(task_tags.tag_id, data.tag_ids),
        ),
      )
    return { removed: ownedIds.length }
  })
