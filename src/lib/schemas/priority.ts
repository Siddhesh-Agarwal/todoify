import { z } from 'zod'

export const PRIORITY_LEVELS = ['P0', 'P1', 'P2', 'P3', 'P4'] as const
export type Priority = (typeof PRIORITY_LEVELS)[number]

// DESIGN.md §4.4 — stored integer weight drives custom sort. Weight is stored,
// not derived from enum ordinal, so the scale can be rebalanced without a migration.
export const PRIORITY_WEIGHTS: Record<Priority, number> = {
  P0: 100,
  P1: 75,
  P2: 50,
  P3: 25,
  P4: 10,
}

export const DEFAULT_PRIORITY: Priority = 'P2'

export const prioritySchema = z.enum(PRIORITY_LEVELS)

export function priorityToWeight(p: Priority): number {
  return PRIORITY_WEIGHTS[p]
}
