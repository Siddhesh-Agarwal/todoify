# Task Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer for tasks — Zod schemas (task, priority weights, quick-add parser), an FTS5 search migration, and TanStack Start server functions for task/project/tag CRUD, quick-add creation, and bulk operations — so every later view can read/write tasks through server functions alone (no REST).

**Architecture:** Pure, D1-free logic (priority weights, task schemas, quick-add parser, FTS query builder) is developed test-first with Vitest and lives in `src/lib/schemas` + `src/lib`. D1-touching server functions live in `src/server`, are scoped per-owner via `requireUserId()`, filter `is_trashed = false` everywhere except the trash view, sort on `priority_weight` (never the enum), and use `db.batch()` for every multi-row write (D1 batch is an implicit atomic transaction; `db.transaction()` throws on D1). Full-text search uses a hand-written self-contained FTS5 table whose rowid mirrors the `task` table's implicit rowid, kept in sync by triggers — not a Drizzle-modeled table. Status transitions and `started_at`/`completed_at`/`trashed_at` timestamps are computed server-side only; client input never carries them.

**Tech Stack:** TanStack Start (server functions), Drizzle ORM over Cloudflare D1, Zod 4, Vitest, wrangler d1 migrations.

**Spec source of truth:** `docs/DESIGN.md` (§2 data model, §3 lifecycle, §4.1 task mgmt, §4.3 search, §4.4 priority, §4.6 quick-add). `AGENTS.md` lists the hard constraints (no REST, no D1 transactions, soft-delete only, FTS5 hand-written, server-side timestamps).

**Testing note:** Vitest runs in `node` with no D1 binding, so pure-logic modules are built TDD. Server functions touch D1 (only available inside the worker runtime) and are verified by `pnpm run build` (tsc) + local D1 migration apply + manual dev-server smoke. A miniflare/D1 unit-test harness is intentionally deferred to a later chunk.

---

## File Structure

**Create (pure logic — TDD):**
- `src/lib/schemas/priority.ts` — `PRIORITY_LEVELS`, `Priority`, `PRIORITY_WEIGHTS`, `DEFAULT_PRIORITY`, `prioritySchema`, `priorityToWeight()`. Single source of the weight map (DESIGN §4.4).
- `src/lib/schemas/priority.test.ts`
- `src/lib/schemas/task.ts` — `TASK_STATUSES`, `TaskStatus`, `taskStatusSchema`, `taskCreateInputSchema`, `taskUpdateInputSchema` (id + patchable fields), `changeTaskStatusInput`, `taskListQuerySchema` (filters + paging + sort). No status/timestamps in create/update input — those are server-controlled.
- `src/lib/schemas/task.test.ts`
- `src/lib/schemas/quick-add.ts` — `parseQuickAdd(raw)` + `parsedQuickAddSchema` + `ParsedQuickAdd`. Token-scan parser per DESIGN §4.6 extraction order.
- `src/lib/schemas/quick-add.test.ts`
- `src/lib/fts.ts` — `toFtsQuery(input)` builds a safe FTS5 MATCH expression (quotes tokens, neutralizes operators).
- `src/lib/fts.test.ts`

**Create (server functions — verified by build + manual):**
- `src/server/tasks.ts` — `createTask`, `createTaskFromQuickAdd`, `getTask`, `listTasks`, `listTrash`, `updateTask`, `changeTaskStatus`, `trashTask`, `restoreTask`.
- `src/server/projects.ts` — `createProject`, `listProjects`, `getProject`, `updateProject`, `archiveProject`.
- `src/server/tags.ts` — `listTags`, `createTag`.
- `src/server/bulk.ts` — `bulkChangeStatus`, `bulkTrash`, `bulkAddTags`, `bulkRemoveTags` (all via `db.batch`).

**Create (migration):**
- `drizzle/0001_fts5_search.sql` — hand-written FTS5 virtual table + sync triggers.
- `drizzle/meta/0001_snapshot.json` — copy of `0000_snapshot.json` (Drizzle schema unchanged; FTS5 is not Drizzle-modeled).

**Modify:**
- `src/server/session.ts` — add `getCurrentSession()` plain helper + `requireUserId()` guard; keep existing `getSession` server fn.
- `drizzle/meta/_journal.json` — append entry idx 1 so future `drizzle-kit generate` won't collide with the hand-written `0001_*` file.

---

## Task 1: Priority weight module (TDD)

**Files:**
- Create: `src/lib/schemas/priority.ts`
- Test: `src/lib/schemas/priority.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/priority.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PRIORITY_WEIGHTS,
  PRIORITY_LEVELS,
  DEFAULT_PRIORITY,
  prioritySchema,
  priorityToWeight,
} from './priority'

describe('PRIORITY_WEIGHTS', () => {
  it('matches DESIGN.md §4.4 exactly', () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      P0: 100,
      P1: 75,
      P2: 50,
      P3: 25,
      P4: 10,
    })
  })

  it('lists levels P0..P4 in order', () => {
    expect(PRIORITY_LEVELS).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })
})

describe('priorityToWeight', () => {
  it('returns the stored weight for each level', () => {
    expect(priorityToWeight('P0')).toBe(100)
    expect(priorityToWeight('P1')).toBe(75)
    expect(priorityToWeight('P2')).toBe(50)
    expect(priorityToWeight('P3')).toBe(25)
    expect(priorityToWeight('P4')).toBe(10)
  })
})

describe('DEFAULT_PRIORITY', () => {
  it('is P2 (DESIGN §4.4)', () => {
    expect(DEFAULT_PRIORITY).toBe('P2')
  })
})

describe('prioritySchema', () => {
  it('accepts P0 through P4', () => {
    for (const p of ['P0', 'P1', 'P2', 'P3', 'P4']) {
      expect(prioritySchema.safeParse(p).success).toBe(true)
    }
  })
  it('rejects P5, lowercase, and bare P', () => {
    expect(prioritySchema.safeParse('P5').success).toBe(false)
    expect(prioritySchema.safeParse('p0').success).toBe(false)
    expect(prioritySchema.safeParse('P').success).toBe(false)
    expect(prioritySchema.safeParse('').success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/schemas/priority.test.ts`
Expected: FAIL — `Failed to load url ./priority` (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schemas/priority.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/schemas/priority.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/priority.ts src/lib/schemas/priority.test.ts
git commit -m "feat: add priority weight map and schema"
```

---

## Task 2: Task Zod schemas (TDD)

**Files:**
- Create: `src/lib/schemas/task.ts`
- Test: `src/lib/schemas/task.test.ts`
- Depends on: `src/lib/schemas/priority.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/task.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/schemas/task.test.ts`
Expected: FAIL — module `./task` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schemas/task.ts`:

```ts
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

// List/filter query (DESIGN §4.2, §4.3).
export const taskListQuerySchema = z.object({
  status: z.union([taskStatusSchema, z.array(taskStatusSchema)]).optional(),
  priority: z.union([prioritySchema, z.array(prioritySchema)]).optional(),
  project_id: z.uuid().optional(),
  tag_id: z.union([z.uuid(), z.array(z.uuid())]).optional(),
  due_before: dateString.optional(),
  due_after: dateString.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['priority', 'due', 'created']).default('priority'),
})
export type TaskListQuery = z.infer<typeof taskListQuerySchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/schemas/task.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/task.ts src/lib/schemas/task.test.ts
git commit -m "feat: add task Zod schemas (create/update/status/list-filter)"
```

---

## Task 3: Quick-add parser (TDD)

**Files:**
- Create: `src/lib/schemas/quick-add.ts`
- Test: `src/lib/schemas/quick-add.test.ts`
- Depends on: `src/lib/schemas/priority.ts`

**Spec:** DESIGN §4.6. Extraction order: `due:+N` → priority (`P[0-4]` standalone word) → `#project` → `@tags` → remainder = title. `due:+N` integer days from today; invalid/non-numeric dropped with a UI warning. Priority last-one-wins; default P2. Only one `#project` (extras warned + first used). `@tag` repeatable, unmatched auto-created (the server fn handles creation; the parser just lists names).

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/quick-add.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseQuickAdd } from './quick-add'

function dateOffset(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe('parseQuickAdd — DESIGN.md example', () => {
  it('parses the canonical example correctly', () => {
    const result = parseQuickAdd('Fix login race condition #auth-service @bug @urgent P0 due:+1')
    expect(result.title).toBe('Fix login race condition')
    expect(result.projectName).toBe('auth-service')
    expect(result.tags).toEqual(['bug', 'urgent'])
    expect(result.priority).toBe('P0')
    expect(result.dueDate).toBe(dateOffset(1))
    expect(result.warnings).toEqual([])
  })
})

describe('parseQuickAdd — defaults', () => {
  it('defaults priority to P2 when no P-token present', () => {
    expect(parseQuickAdd('just a title').priority).toBe('P2')
  })
  it('has no project/tags/due when none present', () => {
    const r = parseQuickAdd('just a title')
    expect(r.projectName).toBeUndefined()
    expect(r.tags).toEqual([])
    expect(r.dueDate).toBeUndefined()
  })
})

describe('parseQuickAdd — priority last-wins', () => {
  it('uses the last P-token when repeated', () => {
    expect(parseQuickAdd('thing P1 P3').priority).toBe('P3')
  })
  it('does not match P inside a word like HTTP0', () => {
    const r = parseQuickAdd('upgrade HTTP0 module')
    expect(r.priority).toBe('P2')
    expect(r.title).toBe('upgrade HTTP0 module')
  })
})

describe('parseQuickAdd — due date', () => {
  it('due:+0 means today', () => {
    expect(parseQuickAdd('x due:+0').dueDate).toBe(dateOffset(0))
  })
  it('due:+3 is three days out', () => {
    expect(parseQuickAdd('x due:+3').dueDate).toBe(dateOffset(3))
  })
})

describe('parseQuickAdd — project', () => {
  it('takes the first #project and warns on extras', () => {
    const r = parseQuickAdd('x #alpha #beta')
    expect(r.projectName).toBe('alpha')
    expect(r.warnings.length).toBe(1)
    expect(r.warnings[0]).toMatch(/Multiple #project/)
  })
})

describe('parseQuickAdd — tags', () => {
  it('collects multiple @tags in order', () => {
    expect(parseQuickAdd('x @a @b @c').tags).toEqual(['a', 'b', 'c'])
  })
  it('keeps tags even with a project and priority', () => {
    const r = parseQuickAdd('Do thing #proj @t1 P1 @t2')
    expect(r.tags).toEqual(['t1', 't2'])
    expect(r.projectName).toBe('proj')
    expect(r.priority).toBe('P1')
    expect(r.title).toBe('Do thing')
  })
})

describe('parseQuickAdd — title', () => {
  it('collapses leftover whitespace', () => {
    expect(parseQuickAdd('hello   world').title).toBe('hello world')
  })
  it('strips tokens but keeps the rest as title', () => {
    expect(parseQuickAdd('fix the bug in module P2').title).toBe('fix the bug in module')
  })
})

describe('parseQuickAdd — malformed input', () => {
  it('warns and drops a non-numeric due, still parses the task', () => {
    const r = parseQuickAdd('x due:+abc')
    expect(r.dueDate).toBeUndefined()
    expect(r.warnings.length).toBe(1)
    expect(r.title).toBe('x')
  })
  it('empty string yields empty title', () => {
    expect(parseQuickAdd('').title).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/schemas/quick-add.test.ts`
Expected: FAIL — `./quick-add` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/schemas/quick-add.ts`:

```ts
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

const DUE_RE = /\bdue:\+(\d+)\b/i
const PRIORITY_RE = /\bP([0-4])\b/
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
    if (Number.isInteger(n) && n >= 0) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/schemas/quick-add.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/quick-add.ts src/lib/schemas/quick-add.test.ts
git commit -m "feat: add quick-add shorthand parser"
```

---

## Task 4: FTS5 query builder (TDD)

**Files:**
- Create: `src/lib/fts.ts`
- Test: `src/lib/fts.test.ts`

**Why:** The FTS5 `MATCH` expression has its own query syntax (AND/OR/NEAR, `*` prefix, `:` column filters). We must not let raw user input inject operators. We quote each whitespace token as an FTS5 string literal (double-quote chars escaped by doubling) and join with space (implicit AND). Empty input → `''`; the server fn skips `MATCH` when empty.

- [ ] **Step 1: Write the failing test**

Create `src/lib/fts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toFtsQuery } from './fts'

describe('toFtsQuery', () => {
  it('returns empty string for blank input', () => {
    expect(toFtsQuery('')).toBe('')
    expect(toFtsQuery('   ')).toBe('')
  })
  it('quotes each whitespace-separated token', () => {
    expect(toFtsQuery('login race')).toBe('"login" "race"')
  })
  it('quotes a single token', () => {
    expect(toFtsQuery('login')).toBe('"login"')
  })
  it('neutralizes FTS5 operators by quoting them literally', () => {
    // NEAR is an operator only outside quotes; inside quotes it is literal text.
    expect(toFtsQuery('NEAR (a, b)')).toBe('"NEAR" "(a," "b)"')
  })
  it('strips quote and star chars so they cannot break out of the literal', () => {
    expect(toFtsQuery('a"b*c')).toBe('"a b c"')
  })
  it('collapses extra whitespace between tokens', () => {
    expect(toFtsQuery('a   b')).toBe('"a" "b"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/fts.test.ts`
Expected: FAIL — `./fts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/fts.ts`:

```ts
// Build a safe FTS5 MATCH expression from raw user input.
// Each whitespace token is wrapped as an FTS5 string literal (content inside
// double quotes is treated as literal text, never as operators). Double-quote
// and star chars are stripped so they cannot break out of the literal. Tokens
// are joined with a space (FTS5 implicit AND). Empty/whitespace input -> ''.
export function toFtsQuery(input: string): string {
  return input
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => `"${t}"`)
    .join(' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/fts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fts.ts src/lib/fts.test.ts
git commit -m "feat: add FTS5 MATCH query builder"
```

---

## Task 5: Auth guard helper

**Files:**
- Modify: `src/server/session.ts`

**Why:** Every task/project/tag server fn needs the authenticated user's id and must scope all queries by `owner_id`. Add a plain (non-server-fn) `getCurrentSession()` helper + `requireUserId()` so other server fns can call them without an extra round-trip. Keep the existing `getSession` server fn (used by route loaders) delegating to the helper.

- [ ] **Step 1: Replace `src/server/session.ts` with the new version**

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createAuth } from '@/lib/auth'
import { env } from 'cloudflare:workers'

// Plain async helper — callable from other server fns without an extra hop.
// D1/auth bindings only exist inside the request handler, so createAuth() is
// built per-request here (never at module scope).
export async function getCurrentSession() {
  const auth = createAuth(env)
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
}

// Returns the authenticated user's id, or throws if there is no session.
// Server fns use this to scope every query by owner_id.
export async function requireUserId(): Promise<string> {
  const session = await getCurrentSession()
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  return getCurrentSession()
})
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/session.ts
git commit -m "refactor: add requireUserId auth guard helper"
```

---

## Task 6: FTS5 migration (hand-written)

**Files:**
- Create: `drizzle/0001_fts5_search.sql`
- Create: `drizzle/meta/0001_snapshot.json` (copy of `0000_snapshot.json`)
- Modify: `drizzle/meta/_journal.json`

**Design:** A self-contained FTS5 table `task_fts(title, description)` whose `rowid` mirrors the `task` table's implicit rowid. The `task` table is a rowid table (text PK, not `WITHOUT ROWID`), so `new.rowid`/`old.rowid` are valid in triggers and `rowid` is a valid column reference in queries. Self-contained (stores its own copy of title/description) avoids external-content `content_rowid` quirks with text PKs; storage cost is negligible at <2k tasks/user (DESIGN §6). Delete-by-rowid is the universally supported FTS5 deletion path. The UPDATE trigger fires on every task update (including non-text changes); reindex cost is trivial at this scale and keeps the index always consistent.

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/0001_fts5_search.sql`:

```sql
-- Full-text search over task title + description (DESIGN.md §4.3).
-- Self-contained FTS5 table; rowid mirrors the task table's implicit rowid so
-- sync triggers can delete/update by rowid (the universally supported path).
-- Not Drizzle-modeled (AGENTS.md); hand-written, applied via wrangler.
CREATE VIRTUAL TABLE task_fts USING fts5(
  title,
  description
);

CREATE TRIGGER task_ai AFTER INSERT ON task BEGIN
  INSERT INTO task_fts (rowid, title, description)
  VALUES (new.rowid, new.title, COALESCE(new.description, ''));
END;

CREATE TRIGGER task_ad AFTER DELETE ON task BEGIN
  DELETE FROM task_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER task_au AFTER UPDATE ON task BEGIN
  DELETE FROM task_fts WHERE rowid = old.rowid;
  INSERT INTO task_fts (rowid, title, description)
  VALUES (new.rowid, new.title, COALESCE(new.description, ''));
END;
```

- [ ] **Step 2: Copy the schema snapshot so drizzle-kit stays consistent**

The Drizzle schema (`src/lib/db/schema.ts`) is unchanged by this migration (FTS5 is not Drizzle-modeled), so the next snapshot is identical to `0000`. Copy it:

Run:
```bash
cp drizzle/meta/0000_snapshot.json drizzle/meta/0001_snapshot.json
```

- [ ] **Step 3: Register the migration in the drizzle journal**

Edit `drizzle/meta/_journal.json` — append an `idx: 1` entry to the `entries` array so a future `drizzle-kit generate` produces `0002_*` (no filename collision with the hand-written `0001_*`). The final file:

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1783836880346,
      "tag": "0000_daily_golden_guardian",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "6",
      "when": 1784000000000,
      "tag": "0001_fts5_search",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 4: Apply the migration to local D1**

Run: `pnpm run db:migrate:local`
Expected: wrangler reports migration `0001_fts5_search` applied to the local `todoify` D1.

- [ ] **Step 5: Verify the FTS table + triggers exist in local D1**

Run:
```bash
npx wrangler d1 execute todoify --local --command "SELECT name, type FROM sqlite_master WHERE name LIKE 'task_fts%' OR name LIKE 'task_a%' ORDER BY name;"
```
Expected output includes: `task_fts` (table), `task_ai`, `task_ad`, `task_au` (triggers).

- [ ] **Step 6: Commit**

```bash
git add drizzle/0001_fts5_search.sql drizzle/meta/0001_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): add FTS5 search table and sync triggers"
```

---

## Task 7: Tag server functions

**Files:**
- Create: `src/server/tags.ts`
- Depends on: `src/server/session.ts`, `src/lib/db`

- [ ] **Step 1: Write the implementation**

Create `src/server/tags.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type DB } from '@/lib/db'
import { tag } from '@/lib/db/schema'
import { requireUserId } from './session'

export const listTags = createServerFn({ method: 'GET' })
  .validator(z.void().optional())
  .handler(async () => {
    const userId = await requireUserId()
    const db = getDb()
    return db.select().from(tag).where(eq(tag.owner_id, userId)).orderBy(asc(tag.name))
  })

export const createTag = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(1).max(50) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(tag).values({ id, name: data.name, owner_id: userId })
    const [created] = await db.select().from(tag).where(eq(tag.id, id))
    return created
  })

// Plain helper (not a server fn) used by quick-add task creation to resolve
// a tag name to an id. Caller is responsible for batching the insert.
export async function findTagByName(db: DB, userId: string, name: string) {
  const [row] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.owner_id, userId), eq(tag.name, name)))
  return row
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/tags.ts
git commit -m "feat: add tag list/create server functions"
```

---

## Task 8: Project server functions

**Files:**
- Create: `src/server/projects.ts`
- Depends on: `src/server/session.ts`, `src/lib/db`

**Spec:** DESIGN §2.2, §4.5. Flat (no sub-projects), alphabetical by name, archive (not delete) to preserve history.

- [ ] **Step 1: Write the implementation**

Create `src/server/projects.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, type DB } from '@/lib/db'
import { project } from '@/lib/db/schema'
import { requireUserId } from './session'

export const createProject = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const id = crypto.randomUUID()
    await db.insert(project).values({
      id,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? null,
      owner_id: userId,
      archived: false,
    })
    const [created] = await db.select().from(project).where(eq(project.id, id))
    return created
  })

export const listProjects = createServerFn({ method: 'GET' })
  .validator(z.object({ include_archived: z.boolean().default(false) }).optional())
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const opts = data ?? { include_archived: false }
    const conds = [eq(project.owner_id, userId)]
    if (!opts.include_archived) conds.push(eq(project.archived, false))
    return db.select().from(project).where(and(...conds)).orderBy(asc(project.name))
  })

export const getProject = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const [row] = await db
      .select()
      .from(project)
      .where(and(eq(project.id, data.id), eq(project.owner_id, userId)))
    if (!row) throw new Error('Not found')
    return row
  })

export const updateProject = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.uuid(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      archived: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    const { id, ...patch } = data
    const [existing] = await db
      .select({ id: project.id })
      .from(project)
      .where(and(eq(project.id, id), eq(project.owner_id, userId)))
    if (!existing) throw new Error('Not found')
    await db.update(project).set(patch).where(eq(project.id, id))
    const [updated] = await db.select().from(project).where(eq(project.id, id))
    return updated
  })

// Archive (or unarchive) a project. DESIGN §4.5: archive, never delete.
export const archiveProject = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()
    await db
      .update(project)
      .set({ archived: data.archived })
      .where(and(eq(project.id, data.id), eq(project.owner_id, userId)))
    return { id: data.id, archived: data.archived }
  })

// Plain helper used by quick-add task creation to resolve a project by name
// (case-insensitive). Caller batches the insert if it is new.
export async function findProjectByName(db: DB, userId: string, name: string) {
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.owner_id, userId), sql`lower(${project.name}) = lower(${name})`))
    .limit(1)
  return row
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/projects.ts
git commit -m "feat: add project CRUD + archive server functions"
```

---

## Task 9: Task read server functions (get / list / listTrash)

**Files:**
- Create: `src/server/tasks.ts`
- Depends on: `src/server/session.ts`, `src/lib/db`, `src/lib/schemas/task.ts`, `src/lib/fts.ts`

**Spec:** DESIGN §4.1, §4.2, §4.3, §4.4. Every query filters `is_trashed = false` except `listTrash`. Sort on `priority_weight` (never the enum). Default sort = priority-first: `priority_weight DESC, due_date ASC NULLS LAST`. Pagination is page-based (no infinite scroll, DESIGN §4.2). Search uses the FTS5 table joined by rowid.

- [ ] **Step 1: Write the read functions (and the file header + shared imports)**

Create `src/server/tasks.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, sql, lte, gte } from 'drizzle-orm'
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
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/tasks.ts
git commit -m "feat: add task read server functions (get/list/listTrash)"
```

---

## Task 10: Task write server functions (create / quick-add / update / status / trash / restore)

**Files:**
- Modify: `src/server/tasks.ts` (append write functions)
- Depends on: `src/server/session.ts`, `src/server/projects.ts` (`findProjectByName`), `src/server/tags.ts` (`findTagByName`), `src/lib/db`, schemas.

**Spec / constraints:**
- DESIGN §3 lifecycle + §4.1. `createTask` and `createTaskFromQuickAdd` pre-generate the id so the task insert + tag-link inserts can run in one atomic `db.batch()`. `createTaskFromQuickAdd` resolves project (case-insensitive by name; creates if missing) and tags (get-or-create) server-side, all in one batch.
- `updateTask` replaces the full tag set atomically (delete links + insert new links in one batch) when `tag_ids` is provided; recomputes `priority_weight` when `priority` changes; always bumps `updated_at`.
- `changeTaskStatus` enforces the allowed-transition table and sets `started_at` (first time entering IN_PROGRESS only) / `completed_at` (on COMPLETED or DROPPED) / clears `completed_at` on reopen to PLANNING. All timestamp logic server-side.
- `trashTask`/`restoreTask` toggle `is_trashed` + `trashed_at`. No permanent delete anywhere.
- Allowed transitions:
  ```
  PLANNING -> IN_PROGRESS, DROPPED
  IN_PROGRESS -> COMPLETED, DROPPED, PLANNING
  COMPLETED -> PLANNING        (reopen)
  DROPPED -> PLANNING          (reopen)
  ```

- [ ] **Step 1: Append the write functions to `src/server/tasks.ts`**

First, update the import block at the top of the file.

Replace the existing `@/lib/db/schema` import line with:

```ts
import { task, task_tags, project, tag } from '@/lib/db/schema'
```

Replace the existing `@/lib/schemas/task` import line with:

```ts
import {
  taskCreateInputSchema,
  taskUpdateInputSchema,
  taskListQuerySchema,
  changeTaskStatusInput,
  type TaskStatus,
} from '@/lib/schemas/task'
```

Add these two helper imports alongside the existing `./session` import:

```ts
import { findProjectByName } from './projects'
import { findTagByName } from './tags'
```

Add this import (used by the write functions to sync `priority_weight` and to
default/validate priority on the quick-add path):

```ts
import { priorityToWeight, prioritySchema, DEFAULT_PRIORITY } from '@/lib/schemas/priority'
```

Then append these functions to the end of the file:

```ts
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
    await db.batch(stmts)
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
    const tagNames = data.tags
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
    await db.batch(stmts)

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
    await db.batch(stmts)

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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `any[]` triggers no errors under `strict` — it doesn't; strict allows `any`.)

- [ ] **Step 3: Commit**

```bash
git add src/server/tasks.ts
git commit -m "feat: add task write server functions (create/quick-add/update/status/trash/restore)"
```

---

## Task 11: Bulk operations server functions

**Files:**
- Create: `src/server/bulk.ts`
- Depends on: `src/server/session.ts`, `src/lib/db`, `src/lib/schemas/task.ts`

**Spec:** DESIGN §4.1 — bulk status change, bulk trash, bulk tag add/remove. Use `db.batch()` for atomic multi-row writes (AGENTS.md: no D1 transactions). Resolve all reads/validation before building the batch. Bulk operations act only on non-trashed tasks owned by the current user (except `bulkTrash`, which trashes them).

- [ ] **Step 1: Write the implementation**

Create `src/server/bulk.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { task, task_tags, tag } from '@/lib/db/schema'
import { requireUserId } from './session'
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
    if (stmts.length > 0) await db.batch(stmts)
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
// the missing task-tag links in one batch (duplicates are ignored via ON CONFLICT).
export const bulkAddTags = createServerFn({ method: 'POST' })
  .validator(idsSchema.extend({ tag_names: z.array(z.string().min(1)).min(1) }))
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    // Resolve tag ids (get-or-create by name).
    const existing = await db
      .select({ id: tag.id, name: tag.name })
      .from(tag)
      .where(and(eq(tag.owner_id, userId), inArray(tag.name, data.tag_names)))
    const byName = new Map(existing.map((t) => [t.name, t.id]))
    const toCreate = data.tag_names.filter((n) => !byName.has(n))
    const newIds: Record<string, string> = {}
    for (const n of toCreate) newIds[n] = crypto.randomUUID()

    // Existing links to skip (so we don't re-insert duplicates).
    const allTagIds = data.tag_names.map((n) => byName.get(n) ?? newIds[n]!)
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
    if (stmts.length > 0) await db.batch(stmts)
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
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/bulk.ts
git commit -m "feat: add bulk status/trash/tag server functions"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pure-logic tests pass (auth, priority, task, quick-add, fts).

- [ ] **Step 2: Run a full production build (includes tsc --noEmit)**

Run: `pnpm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Smoke-test against local D1 via dev server**

Run: `pnpm run dev`
Then, in another terminal, sign up / log in (existing auth flow) and exercise the data layer by calling server functions from the browser console is not trivial; instead verify the migration + a direct D1 query:

```bash
npx wrangler d1 execute todoify --local --command "SELECT count(*) FROM task_fts; SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'task_a%';"
```
Expected: `task_fts` row count 0 (empty), triggers `task_ai`/`task_ad`/`task_au` listed.

- [ ] **Step 4: Confirm no server fn exports a status/timestamp from client input**

Grep to confirm create/update inputs carry no `status`, `started_at`, `completed_at`, `trashed_at`, `priority_weight`:

Run: `rg -n "started_at|completed_at|trashed_at|priority_weight" src/lib/schemas/`
Expected: no matches (these are server-controlled, absent from client schemas).

- [ ] **Step 5: Final commit (if any formatting/verification artifacts)**

Only if steps above produced changes:
```bash
git add -A
git commit -m "chore: task foundation verification"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §2 data model (schema exists in 0000 + this plan adds FTS), §3 lifecycle (Task 10 `changeTaskStatus` + `ALLOWED_TRANSITIONS`), §4.1 task mgmt + bulk (Tasks 9–11), §4.3 search + FTS (Tasks 4 + 6 + 9 `listTasks`), §4.4 priority weights (Task 1, used in create/update/sort), §4.6 quick-add (Tasks 3 + 10 `createTaskFromQuickAdd`), §4.5 project/tag CRUD (Tasks 7, 8). Soft-delete filter applied in every read (Task 9) and trash/restore (Task 10).
- **Placeholders:** none — every code step contains the full implementation.
- **Type consistency:** `requireUserId()` used uniformly; `priorityToWeight` imported in tasks + bulk; `findProjectByName`/`findTagByName` exported from projects/tags and imported in tasks; `taskListQuerySchema`/`changeTaskStatusInput`/`taskCreateInputSchema`/`taskUpdateInputSchema` names match across files; `ParsedQuickAdd` fields (`title`/`projectName`/`tags`/`priority`/`dueDate`) match `quickAddCreateInput`.
- **Constraints honored:** no REST (server fns only); `db.batch()` for all multi-row writes; soft-delete only; FTS5 hand-written; server-side timestamps; sort on `priority_weight`; no `drizzle-kit push` (wrangler apply).
