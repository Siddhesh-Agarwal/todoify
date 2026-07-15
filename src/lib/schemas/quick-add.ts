import { z } from 'zod'
import { prioritySchema, DEFAULT_PRIORITY, type Priority } from './priority'

export const parsedQuickAddSchema = z.object({
  title: z.string(),
  projectName: z.string().optional(),
  tags: z.array(z.string()).default([]),
  priority: prioritySchema.default(DEFAULT_PRIORITY),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  warnings: z.array(z.string()).default([]),
})
export type ParsedQuickAdd = z.infer<typeof parsedQuickAddSchema>

const DUE_RE = /\bdue:\+(\S+)\b/i
const PRIORITY_RE = /\bP([0-4])\b/g
const PROJECT_RE = /#(\S+)/g
const TAG_RE = /@(\S+)/g

function toDateString(daysFromNow: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

export function parseQuickAdd(raw: string): ParsedQuickAdd {
  const warnings: string[] = []
  let s = raw

  // 1) due:+N  (DESIGN: invalid/non-numeric dropped with a UI warning)
  let dueDate: string | undefined
  const dueMatch = s.match(DUE_RE)
  if (dueMatch) {
    const n = Number(dueMatch[1])
    if (/^\d+$/.test(dueMatch[1]) && Number.isInteger(n) && n >= 0) {
      dueDate = toDateString(n)
    } else {
      warnings.push(`Ignored invalid due value: "${dueMatch[0]}"`)
    }
    s = s.replace(DUE_RE, ' ')
  }

  // 2) priority P0–P4 (last one wins)
  let priority: Priority = DEFAULT_PRIORITY
  const priorityMatches = s.match(PRIORITY_RE)
  if (priorityMatches && priorityMatches.length > 0) {
    const last = priorityMatches[priorityMatches.length - 1]
    priority = `P${last[1]}` as Priority
    s = s.replace(PRIORITY_RE, ' ')
  }

  // 3) #project (only one; extras warned + ignored, first used)
  let projectName: string | undefined
  const projectMatches = s.match(PROJECT_RE)
  if (projectMatches) {
    if (projectMatches.length > 1) {
      warnings.push(`Multiple #project tokens; using the first: "${projectMatches[0]}"`)
    }
    projectName = projectMatches[0].slice(1)
    s = s.replace(PROJECT_RE, ' ')
  }

  // 4) @tags (repeatable)
  const tagMatches = s.match(TAG_RE)
  const tags = tagMatches ? tagMatches.map((t) => t.slice(1)) : []
  if (tagMatches) s = s.replace(TAG_RE, ' ')

  // 5) remainder = title
  const title = s.replace(/\s+/g, ' ').trim()

  return { title, projectName, tags, priority, dueDate, warnings }
}
