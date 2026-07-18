import { and, eq, inArray, lte, gte, sql } from 'drizzle-orm'
import { task, task_tags } from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import type { TaskListQuery } from '@/lib/schemas/task'
import { toFtsQuery } from '@/lib/fts'

// Shared WHERE builder for task list + stats queries. Mirrors the facets
// accepted by taskListQuerySchema (DESIGN §4.3). Always scopes by owner_id and
// excludes trashed tasks (soft-delete, AGENTS.md).
export function buildTaskWhere(db: DB, userId: string, data: TaskListQuery) {
  const conds = [eq(task.owner_id, userId), eq(task.is_trashed, false)] as ReturnType<typeof eq>[]

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

  return and(...conds)
}
