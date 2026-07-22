import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { task } from '@/lib/db/schema'
import { requireUserId } from './session.server'
import { buildTaskWhere } from '@/lib/task-query'
import { taskListQuerySchema } from '@/lib/schemas/task'
import { ymd } from '@/lib/utils'

// Four filter-aware counts in a single round-trip via SQLite FILTER clauses.
// All counts apply the caller's active facets (narrowing the list narrows stats).
export const getTaskStats = createServerFn({ method: 'GET' })
  .validator(taskListQuerySchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const where = buildTaskWhere(db, userId, data)

    const today = new Date()
    const week = new Date(today)
    week.setUTCDate(week.getUTCDate() + 7)
    const todayStr = ymd(today)
    const weekStr = ymd(week)

    const [row] = await db
      .select({
        inProgress: sql<number>`count(*) FILTER (WHERE ${task.status} = 'IN_PROGRESS')`.as('in_progress'),
        overdue: sql<number>`count(*) FILTER (WHERE ${task.due_date} < ${todayStr} AND ${task.status} NOT IN ('COMPLETED', 'DROPPED'))`.as('overdue'),
        dueThisWeek: sql<number>`count(*) FILTER (WHERE ${task.due_date} >= ${todayStr} AND ${task.due_date} <= ${weekStr} AND ${task.status} NOT IN ('COMPLETED', 'DROPPED'))`.as('due_this_week'),
        totalActive: sql<number>`count(*) FILTER (WHERE ${task.status} IN ('PLANNING', 'IN_PROGRESS'))`.as('total_active'),
      })
      .from(task)
      .where(where)

    return {
      inProgress: row.inProgress ?? 0,
      overdue: row.overdue ?? 0,
      dueThisWeek: row.dueThisWeek ?? 0,
      totalActive: row.totalActive ?? 0,
    }
  })
