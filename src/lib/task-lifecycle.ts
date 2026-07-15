import type { TaskStatus } from '@/lib/schemas/task'
import { sql } from 'drizzle-orm'

export const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  PLANNING: ['IN_PROGRESS', 'DROPPED'],
  IN_PROGRESS: ['COMPLETED', 'DROPPED', 'PLANNING'],
  COMPLETED: ['PLANNING'],
  DROPPED: ['PLANNING'],
}

export function isTransitionAllowed(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

// Computes the server-side field updates for a status transition.
// Returns a Record<string, unknown> suitable for `db.update(task).set(...)`.
// `existingStartedAt` is the task's current `started_at` value (null if never started).
export function computeStatusUpdate(
  to: TaskStatus,
  existingStartedAt: string | null,
): Record<string, unknown> {
  const set: Record<string, unknown> = { status: to, updated_at: sql`CURRENT_TIMESTAMP` }
  if (to === 'IN_PROGRESS' && !existingStartedAt) {
    set.started_at = sql`CURRENT_TIMESTAMP`
  }
  if (to === 'COMPLETED' || to === 'DROPPED') {
    set.completed_at = sql`CURRENT_TIMESTAMP`
  }
  if (to === 'PLANNING') {
    set.completed_at = null
  }
  return set
}
