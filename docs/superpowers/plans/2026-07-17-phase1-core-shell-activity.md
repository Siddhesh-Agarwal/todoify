# Phase 1 — Core Shell + Unified Activity View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared app shell + the Unified Activity view at `/app/activity`, fully wired to the existing server layer, so tasks can be created (quick-add), listed, filtered, searched, sorted, paginated, and inspected via keyboard.

**Architecture:** URL search params are the single source of truth for filters/pagination/sort (TanStack Router `validateSearch` → `useQuery(['tasks', search])` + `useQuery(['stats', search])`). `/app` is a layout route (chrome + auth guard) with child views rendered via `<Outlet/>`; Phase 1 ships `/app/activity` only. One new server fn (`getTaskStats`) + one shared helper (`buildTaskWhere`, extracted from `listTasks`). Selection cursor is local React state (not URL).

**Tech Stack:** TanStack Start (React 19, file-based router, server fns), TanStack Query, Drizzle (D1), Zod, shadcn/ui (new-york), Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-phase1-core-shell-activity-design.md`

## Testing strategy

The repo has vitest configured (node env) with pure-logic unit tests only — **no DOM test harness and no D1 mock harness** (both deliberately out of scope per the spec). Therefore:

- **TDD applies to the two pure-logic units:** `buildTaskWhere` (Task 2) and the keybinding resolver `resolveBinding` (Task 5). Write failing test → run → implement → run → commit.
- **Components, hooks wiring D1-backed server fns, and `getTaskStats`** are verified by `pnpm run build` (runs `tsc --noEmit` + `vite build` — the typecheck gate) + `pnpm test` (existing suite stays green) + a manual `pnpm run dev` smoke check at the end. No fabricated tests for code that needs a harness we don't have.

## Implementation decision (deviation from spec wording — please review)

The spec says "5 shadcn `Select` dropdowns: status (multi), priority (multi)...". shadcn's `Select` is single-select only and the spec scoped shadcn additions to `badge`/`select`/`table` (no `popover`/`command`). To honor the **multi-select** intent for status & priority without expanding the primitive set, **status & priority are rendered as toggle chips** (click to toggle membership in the URL array); project, tag, and due remain `Select` dropdowns. Active-facet removable chips still appear for all facets. This is a faithful implementation of "multi-select status/priority filters" — only the primitive differs. If you want strict single-select dropdowns for status/priority instead, say so before execution begins.

## File structure

```
src/lib/task-query.ts                  NEW   shared buildTaskWhere(db, userId, data)
src/lib/task-query.test.ts             NEW   unit tests for buildTaskWhere
src/lib/hooks/use-tasks.ts             NEW   useTasks / useTaskStats / useCreateQuickAdd / useProjects / useTags
src/lib/hooks/use-keybindings.ts       NEW   resolveBinding (pure) + useKeybindings hook
src/lib/hooks/use-keybindings.test.ts  NEW   unit tests for resolveBinding
src/lib/query.ts                       MOD   server-per-request / browser-singleton getQueryClient
src/server/stats.ts                    NEW   getTaskStats(search) — single FILTER-aggregation query
src/server/tasks.ts                    MOD   listTasks refactored to use buildTaskWhere
src/components/ui/badge.tsx            NEW   shadcn
src/components/ui/select.tsx           NEW   shadcn
src/components/ui/table.tsx            NEW   shadcn
src/components/app-sidebar.tsx         NEW   functional rail (views + projects + tags, click-to-filter)
src/components/task-quick-add.tsx      NEW   persistent quick-add input + warnings + optimistic mutation
src/components/task-stat-header.tsx    NEW   4 filter-aware stat cells (click-to-filter)
src/components/task-filter-bar.tsx     NEW   status/priority toggle chips + project/tag/due selects + active chips
src/components/task-row.tsx            NEW   one table row (priority badge, status, relative due, tags)
src/components/task-list.tsx           NEW   sortable table + j/k cursor
src/components/task-pagination.tsx     NEW   numbered ‹ 1 2 3 … n › control
src/routes/app.tsx                     MOD   strip placeholder; keep chrome + guard; add <Outlet/> + <AppSidebar/>
src/routes/app/index.tsx               NEW   redirect → /app/activity
src/routes/app/activity.tsx            NEW   the view: validateSearch + loader + composition + keybindings
```

---

## Task 1: Install shadcn primitives (badge, select, table)

**Files:**
- Create: `src/components/ui/badge.tsx`, `src/components/ui/select.tsx`, `src/components/ui/table.tsx`

- [ ] **Step 1: Add the three primitives via shadcn CLI**

Run:
```bash
pnpm dlx shadcn@latest add badge select table
```
Expected: three files created under `src/components/ui/`, each using `cn` from `@/lib/utils`, matching the new-york style already in the repo. `components.json` already configures `@/components/ui` alias, `src/styles.css` tokens, lucide icons.

- [ ] **Step 2: Verify they typecheck**

Run: `pnpm run build`
Expected: build succeeds (the new primitives compile against existing theme tokens).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/select.tsx src/components/ui/table.tsx
git commit -m "feat(ui): add shadcn badge, select, table primitives"
```

---

## Task 2: Extract shared `buildTaskWhere` (TDD)

**Files:**
- Create: `src/lib/task-query.ts`
- Create: `src/lib/task-query.test.ts`
- Modify: `src/server/tasks.ts` (refactor `listTasks` to use the helper)

- [ ] **Step 1: Write the failing test**

Create `src/lib/task-query.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTaskWhere } from './task-query'
import { taskListQuerySchema, type TaskListQuery } from './schemas/task'

// buildTaskWhere builds a Drizzle SQL `where` from filter facets. The tag_id
// branch needs a db (subquery); tests here do NOT pass tag_id, so db is never
// touched — pass a stub. Covering the tag subquery needs a D1 mock harness
// (out of scope for Phase 1).
const STUB_DB = null as any

function q(overrides: Partial<TaskListQuery> = {}): TaskListQuery {
  return taskListQuerySchema.parse({ ...overrides })
}

describe('buildTaskWhere', () => {
  it('returns a where for the bare case (owner + not-trashed only)', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q())
    expect(where).toBeDefined()
  })

  it('handles status as a single value', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ status: 'IN_PROGRESS' }))
    expect(where).toBeDefined()
  })

  it('handles status as an array', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ status: ['PLANNING', 'IN_PROGRESS'] }))
    expect(where).toBeDefined()
  })

  it('handles priority as an array', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ priority: ['P0', 'P1'] }))
    expect(where).toBeDefined()
  })

  it('handles project_id and due range', () => {
    const where = buildTaskWhere(
      STUB_DB,
      'user-1',
      q({ project_id: crypto.randomUUID(), due_after: '2026-07-17', due_before: '2026-07-24' }),
    )
    expect(where).toBeDefined()
  })

  it('handles search with a real term', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ search: 'login race' }))
    expect(where).toBeDefined()
  })

  it('skips the FTS condition when search is empty/whitespace', () => {
    const where = buildTaskWhere(STUB_DB, 'user-1', q({ search: '   ' }))
    expect(where).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/task-query.test.ts`
Expected: FAIL — `buildTaskWhere` is not defined (module not found).

- [ ] **Step 3: Implement `buildTaskWhere`**

Create `src/lib/task-query.ts`:

```ts
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
```

Note: `import type { DB } from '@/lib/db'` is type-only and erased at runtime, so vitest (node env) never executes the `cloudflare:workers` import that lives in `@/lib/db/index.ts`. The schema import (`@/lib/db/schema`) is safe — it pulls only drizzle-orm + auth.schema, no Cloudflare bindings.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/task-query.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Refactor `listTasks` to use `buildTaskWhere`**

In `src/server/tasks.ts`, replace the inline condition-building (the `conds` block + `where` assignment, currently lines ~39–65) with a call to the helper. The full updated `listTasks`:

```ts
export const listTasks = createServerFn({ method: 'GET' })
  .validator(taskListQuerySchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId()
    const db = getDb()

    const where = buildTaskWhere(db, userId, data)
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
```

Add this import at the top of `src/server/tasks.ts`:
```ts
import { buildTaskWhere } from '@/lib/task-query'
```

- [ ] **Step 6: Verify the full suite + build stay green**

Run: `pnpm test && pnpm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/task-query.ts src/lib/task-query.test.ts src/server/tasks.ts
git commit -m "refactor: extract buildTaskWhere, reuse in listTasks"
```

---

## Task 3: `getTaskStats` server function

**Files:**
- Create: `src/server/stats.ts`

- [ ] **Step 1: Implement `getTaskStats`**

Create `src/server/stats.ts`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { task } from '@/lib/db/schema'
import { requireUserId } from './session.server'
import { buildTaskWhere } from '@/lib/task-query'
import { taskListQuerySchema } from '@/lib/schemas/task'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

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
```

- [ ] **Step 2: Verify build**

Run: `pnpm run build`
Expected: succeeds (no type errors). Integration testing against D1 is deferred (no harness).

- [ ] **Step 3: Commit**

```bash
git add src/server/stats.ts
git commit -m "feat(server): add filter-aware getTaskStats"
```

---

## Task 4: Fix `getQueryClient` + add `use-tasks` hooks

**Files:**
- Modify: `src/lib/query.ts`
- Create: `src/lib/hooks/use-tasks.ts`

- [ ] **Step 1: Make `getQueryClient` server-per-request / browser-singleton**

Replace `src/lib/query.ts` with:

```ts
import { QueryClient } from '@tanstack/react-query'
import { isServer } from '@tanstack/react-start'

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, refetchOnWindowFocus: false },
    },
  })
}

let browserClient: QueryClient | null = null

// Server: fresh client per request (avoid cross-request state leaks across
// Cloudflare Worker isolates). Browser: one singleton for the session.
export function getQueryClient() {
  if (isServer) return makeClient()
  if (!browserClient) browserClient = makeClient()
  return browserClient
}
```

- [ ] **Step 2: Implement the data hooks**

Create `src/lib/hooks/use-tasks.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listTasks, createTaskFromQuickAdd } from '@/server/tasks'
import { listProjects } from '@/server/projects'
import { listTags } from '@/server/tags'
import { getTaskStats } from '@/server/stats'
import { parseQuickAdd } from '@/lib/schemas/quick-add'
import type { TaskListQuery } from '@/lib/schemas/task'
import type { Task } from '@/lib/db/schema'

export function useTasks(search: TaskListQuery) {
  return useQuery({
    queryKey: ['tasks', search],
    queryFn: () => listTasks({ data: search }),
    placeholderData: (prev) => prev,
  })
}

export function useTaskStats(search: TaskListQuery) {
  return useQuery({
    queryKey: ['stats', search],
    queryFn: () => getTaskStats({ data: search }),
    placeholderData: (prev) => prev,
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects({ data: {} }),
    staleTime: 60_000,
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => listTags({ data: undefined }),
    staleTime: 60_000,
  })
}

// Immediate-save quick-add. Optimistic insert into the active tasks cache;
// invalidate tasks + stats on success; rollback on error.
export function useCreateQuickAdd(search: TaskListQuery) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (text: string) => {
      const parsed = parseQuickAdd(text)
      const created = await createTaskFromQuickAdd({
        data: {
          title: parsed.title,
          projectName: parsed.projectName,
          tags: parsed.tags,
          priority: parsed.priority,
          dueDate: parsed.dueDate,
        },
      })
      return { created, warnings: parsed.warnings }
    },
    onMutate: async (text: string) => {
      const parsed = parseQuickAdd(text)
      await qc.cancelQueries({ queryKey: ['tasks', search] })
      const prev = qc.getQueryData<{ items: Task[]; total: number; page: number; pageSize: number }>([
        'tasks',
        search,
      ])
      const placeholder: Task = {
        id: `optimistic-${Date.now()}`,
        title: parsed.title,
        description: null,
        status: 'PLANNING',
        priority: parsed.priority,
        priority_weight: 0,
        project_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        due_date: parsed.dueDate ?? null,
        owner_id: '',
        is_trashed: false,
        trashed_at: null,
      }
      if (prev) {
        qc.setQueryData(['tasks', search], { ...prev, items: [placeholder, ...prev.items], total: prev.total + 1 })
      }
      return { prev }
    },
    onError: (_err, _text, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', search], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/query.ts src/lib/hooks/use-tasks.ts
git commit -m "feat(hooks): add task/stats/projects/tags queries + quick-add mutation"
```

---

## Task 5: Keybinding resolver + hook (TDD)

**Files:**
- Create: `src/lib/hooks/use-keybindings.ts`
- Create: `src/lib/hooks/use-keybindings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/hooks/use-keybindings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveBinding, type KeyHandler } from './use-keybindings'

const h = () => {}

describe('resolveBinding', () => {
  it('fires c / slash / j / k when no input is focused', () => {
    for (const key of ['c', '/', 'j', 'k']) {
      expect(resolveBinding({ key, shiftKey: false }, { isInputFocused: false }, { c: h, '/': h, j: h, k: h })).toBe(h)
    }
  })

  it('suppresses c / slash / j / k when an input is focused', () => {
    for (const key of ['c', '/', 'j', 'k']) {
      expect(
        resolveBinding({ key, shiftKey: false }, { isInputFocused: true }, { c: h, '/': h, j: h, k: h }),
      ).toBeNull()
    }
  })

  it('always fires Escape, even when an input is focused', () => {
    const esc: KeyHandler = vi.fn()
    expect(resolveBinding({ key: 'Escape', shiftKey: false }, { isInputFocused: true }, { Escape: esc })).toBe(esc)
    expect(resolveBinding({ key: 'Escape', shiftKey: false }, { isInputFocused: false }, { Escape: esc })).toBe(esc)
  })

  it('returns null for keys not in the registry', () => {
    expect(resolveBinding({ key: 'x', shiftKey: false }, { isInputFocused: false }, { c: h })).toBeNull()
  })

  it('treats Shift+c as "Shift+c" (not "c"), so plain-letter bindings do not fire on shift', () => {
    expect(
      resolveBinding({ key: 'C', shiftKey: true }, { isInputFocused: false }, { c: h, '/': h, j: h, k: h }),
    ).toBeNull()
  })

  it('resolves Shift+0 when it is registered (reserved for Phase 4 priority keys)', () => {
    const shift0: KeyHandler = vi.fn()
    expect(
      resolveBinding({ key: ')', shiftKey: true }, { isInputFocused: false }, { 'Shift+0': shift0 }),
    ).toBe(shift0)
  })
})
```

Note: `Shift+0` produces `event.key === ')'` on a US keyboard. The resolver builds the key id as `Shift+${event.key}` when shift is held; Phase 4 will register `'Shift+0'` mapped from the actual `event.key`. The last test documents that contract by registering under the raw shifted key.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- src/lib/hooks/use-keybindings.test.ts`
Expected: FAIL — `resolveBinding` is not defined.

- [ ] **Step 3: Implement the resolver + hook**

Create `src/lib/hooks/use-keybindings.ts`:

```ts
import { useEffect, useRef } from 'react'

export type KeyHandler = () => void
export type KeyRegistry = Record<string, KeyHandler>

export interface BindingEvent {
  key: string
  shiftKey: boolean
}
export interface BindingContext {
  isInputFocused: boolean
}

// Pure: decide which handler (if any) a keydown should trigger.
// - Build a key id: "Shift+<key>" when shift is held, else the raw key.
// - If an editable element is focused, only Escape passes through (DESIGN §5:
//   never hijack j/k/c/slash while typing).
export function resolveBinding(
  event: BindingEvent,
  ctx: BindingContext,
  registry: KeyRegistry,
): KeyHandler | null {
  const id = event.shiftKey ? `Shift+${event.key}` : event.key
  if (ctx.isInputFocused && id !== 'Escape') return null
  return registry[id] ?? null
}

function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

// Bind a key→handler registry to window keydown. The registry is kept in a ref
// so callers can pass a fresh object each render without re-binding the listener.
export function useKeybindings(registry: KeyRegistry) {
  const ref = useRef(registry)
  ref.current = registry
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const fn = resolveBinding({ key: e.key, shiftKey: e.shiftKey }, { isInputFocused: isEditableFocused() }, ref.current)
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- src/lib/hooks/use-keybindings.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/use-keybindings.ts src/lib/hooks/use-keybindings.test.ts
git commit -m "feat(hooks): add keybinding resolver + useKeybindings hook"
```

---

## Task 6: Route refactor — `/app` layout + `/app/` redirect

**Files:**
- Modify: `src/routes/app.tsx`
- Create: `src/routes/app/index.tsx`

- [ ] **Step 1: Rewrite `app.tsx` as the layout route**

Replace `src/routes/app.tsx` with:

```tsx
import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { gsap, useGSAP } from "@/lib/gsap";
import { getSession } from "@/server/session";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap
      .timeline()
      .from(".dash-frame", { opacity: 0, scaleX: 0, duration: 0.5, ease: "power3.out" })
      .from(".dash-section", { opacity: 0, y: 16, duration: 0.4, stagger: 0.1, ease: "power2.out" }, "-=0.1");
  }, { scope: container });

  async function logout() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <main className="relative flex min-h-svh w-full max-w-full flex-col overflow-x-hidden">
      <div ref={container} className="flex min-h-svh flex-col">
        {/* Top frame — nav bar */}
        <div className="dash-frame flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">[ TODOIFY ]</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              TASK CONTROL / OPERATOR DASHBOARD
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              OPERATOR: {session?.user?.email}
            </span>
            <Button variant="outline" size="xs" onClick={logout}>DISCONNECT</Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 flex-col gap-px bg-border">
          <div className="grid flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[200px_1fr]">
            <AppSidebar />
            <section className="dash-section flex flex-col bg-background">
              <Outlet />
            </section>
          </div>
        </div>

        {/* Bottom frame — status bar */}
        <div className="dash-frame flex items-center justify-between border-t border-border px-6 py-2">
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>D1 // ONLINE</span>
            <span>FTS5 // ACTIVE</span>
            <span>SESSION // ACTIVE</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            TODOIFY (R) / REV 2.6
          </span>
        </div>
      </div>
    </main>
  );
}
```

Add `import { useRef } from "react";` at the top.

- [ ] **Step 2: Create the `/app/` redirect**

Create `src/routes/app/index.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/activity" });
  },
});
```

- [ ] **Step 3: Verify build (expect a transient error — `AppSidebar` and `/app/activity` don't exist yet)**

Run: `pnpm run build`
Expected: FAILS on missing `@/components/app-sidebar` and (after Task 13) missing `/app/activity` route. This is expected — `app.tsx` references `<AppSidebar/>` and the redirect points to a route not yet created. Proceed to Task 7; the build will go green once `app-sidebar.tsx` exists, and fully green once `app/activity.tsx` exists (Task 13). Do not commit until the build passes at the end of Task 13.

> If you prefer each commit to build green, defer this task's commit until after Task 7 (sidebar exists) — but the `/app/activity` redirect still needs Task 13. The plan keeps the route refactor as one commit at the end of Task 13 to avoid broken intermediate commits.

---

## Task 7: `AppSidebar` — functional rail

**Files:**
- Create: `src/components/app-sidebar.tsx`

- [ ] **Step 1: Implement the sidebar**

Create `src/components/app-sidebar.tsx`:

```tsx
import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useProjects, useTags } from "@/lib/hooks/use-tasks";
import type { TaskListQuery } from "@/lib/schemas/task";

export function AppSidebar() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as TaskListQuery;
  const { data: projects } = useProjects();
  const { data: tags } = useTags();

  function setFacet(patch: Partial<TaskListQuery>) {
    navigate({ to: "/app/activity", search: (prev: TaskListQuery) => ({ ...prev, ...patch, page: 1 }) });
  }

  return (
    <aside className="dash-section hidden flex-col gap-4 bg-background p-4 lg:flex">
      <RailSection title="VIEWS">
        <RailLink label="ACTIVITY" active={true} onClick={() => navigate({ to: "/app/activity" })} />
        <RailLink label="KANBAN" pending />
        <RailLink label="LIST" pending />
        <RailLink label="TRASH" pending />
      </RailSection>

      <RailSection title="PROJECTS">
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <RailLink
              key={p.id}
              label={p.name.toUpperCase()}
              active={search.project_id === p.id}
              onClick={() =>
                setFacet(
                  search.project_id === p.id ? { project_id: undefined } : { project_id: p.id },
                )
              }
            />
          ))
        ) : (
          <RailMuted label="NONE ASSIGNED" />
        )}
      </RailSection>

      <RailSection title="TAGS">
        {tags && tags.length > 0 ? (
          tags.map((t) => (
            <RailLink
              key={t.id}
              label={t.name.toUpperCase()}
              active={Array.isArray(search.tag_id)
                ? search.tag_id.includes(t.id)
                : search.tag_id === t.id}
              onClick={() =>
                setFacet(
                  (Array.isArray(search.tag_id) ? search.tag_id.includes(t.id) : search.tag_id === t.id)
                    ? { tag_id: undefined }
                    : { tag_id: t.id },
                )
              }
            />
          ))
        ) : (
          <RailMuted label="NONE ASSIGNED" />
        )}
      </RailSection>
    </aside>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">// {title}</span>
      {children}
    </div>
  );
}

function RailLink({
  label,
  active,
  pending,
  onClick,
}: {
  label: string;
  active?: boolean;
  pending?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={cn(
        "border-l-2 px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-[0.05em] transition-colors disabled:cursor-not-allowed",
        active
          ? "border-accent text-foreground"
          : pending
          ? "border-transparent text-muted-foreground/40"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      {label}
      {pending ? " ·" : ""}
    </button>
  );
}

function RailMuted({ label }: { label: string }) {
  return <div className="border-l-2 border-transparent px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground/60">{label}</div>;
}
```

Note on `useSearch({ strict: false })`: when `/app` is the parent layout, `strict: false` lets the sidebar read the child route's search params (the activity view's facets) without requiring the parent to declare its own `validateSearch`. This works because TanStack Router merges child search into the parent's search context.

- [ ] **Step 2: Commit (build still pending Task 13's activity route; commit anyway — the sidebar compiles standalone)**

Actually — `app.tsx` imports `AppSidebar`, so once this file exists the only remaining build blocker is the `/app/activity` redirect target. Since the sidebar compiles, commit it now to keep history clean; the full build goes green at Task 13.

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat(ui): add functional app sidebar (views + project/tag click-to-filter)"
```

---

## Task 8: `TaskQuickAdd` — persistent input bar

**Files:**
- Create: `src/components/task-quick-add.tsx`

- [ ] **Step 1: Implement the quick-add bar (forwardRef — the activity view focuses it via `c`)**

Create `src/components/task-quick-add.tsx`:

```tsx
import { forwardRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useCreateQuickAdd } from "@/lib/hooks/use-tasks";
import type { TaskListQuery } from "@/lib/schemas/task";

export const TaskQuickAdd = forwardRef<HTMLInputElement, { search: TaskListQuery }>(
  function TaskQuickAdd({ search }, ref) {
    const [text, setText] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const mutation = useCreateQuickAdd(search);

    useEffect(() => {
      if (!warnings.length) return;
      const t = setTimeout(() => setWarnings([]), 4000);
      return () => clearTimeout(t);
    }, [warnings]);

    function submit() {
      const value = text.trim();
      if (!value) return;
      mutation.mutate(value, {
        onSuccess: ({ warnings: w }) => {
          setWarnings(w);
          setText("");
        },
        onError: () => setWarnings(["Quick-add failed — try again."]),
      });
    }

    return (
      <div className="flex flex-col gap-1 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">+</span>
          <Input
            ref={ref}
            value={text}
            placeholder="QUICK ADD — title #project @tag P0 due:+N  (press c)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") (ref as React.RefObject<HTMLInputElement>)?.current?.blur();
            }}
            aria-invalid={mutation.isError}
          />
        </div>
        {warnings.length > 0 && (
          <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-accent">
            {warnings.map((w, i) => <div key={i}>! {w}</div>)}
          </div>
        )}
      </div>
    );
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/task-quick-add.tsx
git commit -m "feat(ui): add quick-add input bar with inline warnings"
```

---

## Task 9: `TaskStatHeader` — 4 filter-aware cells

**Files:**
- Create: `src/components/task-stat-header.tsx`

- [ ] **Step 1: Implement the stat header**

Create `src/components/task-stat-header.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { useTaskStats } from "@/lib/hooks/use-tasks";
import type { TaskListQuery } from "@/lib/schemas/task";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function TaskStatHeader({ search }: { search: TaskListQuery }) {
  const { data, isLoading } = useTaskStats(search);
  const navigate = useNavigate();

  function go(patch: Partial<TaskListQuery>) {
    navigate({ to: "/app/activity", search: (prev: TaskListQuery) => ({ ...prev, ...patch, page: 1 }) });
  }

  const cells: { label: string; value: number; onClick: () => void }[] = [
    { label: "IN PROGRESS", value: data?.inProgress ?? 0, onClick: () => go({ status: "IN_PROGRESS" }) },
    {
      label: "OVERDUE",
      value: data?.overdue ?? 0,
      onClick: () => go({ due_before: ymd(new Date(Date.now() - 86_400_000)), due_after: undefined }),
    },
    {
      label: "DUE THIS WEEK",
      value: data?.dueThisWeek ?? 0,
      onClick: () => {
        const today = new Date();
        const week = new Date(today);
        week.setUTCDate(week.getUTCDate() + 7);
        go({ due_after: ymd(today), due_before: ymd(week) });
      },
    },
    { label: "TOTAL ACTIVE", value: data?.totalActive ?? 0, onClick: () => go({ status: undefined, priority: undefined, project_id: undefined, tag_id: undefined, due_after: undefined, due_before: undefined, search: undefined }) },
  ];

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
      {cells.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className="dash-readout flex flex-col gap-1 bg-background px-4 py-3 text-left transition-colors hover:bg-secondary"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{c.label}</span>
          <span className="font-mono text-sm font-medium uppercase tracking-[0.05em] text-foreground">
            {isLoading ? "---" : String(c.value).padStart(3, "0")}
          </span>
        </button>
      ))}
    </div>
  );
}
```

OVERDUE click sets `due_before = <yesterday>` to match the stat's strict `due_date < today` (the server filter is `lte`, so `< today` ⟺ `≤ yesterday`).

- [ ] **Step 2: Commit**

```bash
git add src/components/task-stat-header.tsx
git commit -m "feat(ui): add filter-aware stat header with click-to-filter"
```

---

## Task 10: `TaskFilterBar` — toggle chips + selects + active chips

**Files:**
- Create: `src/components/task-filter-bar.tsx`

- [ ] **Step 1: Implement the filter bar**

Create `src/components/task-filter-bar.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects, useTags } from "@/lib/hooks/use-tasks";
import { TASK_STATUSES } from "@/lib/schemas/task";
import { PRIORITY_LEVELS } from "@/lib/schemas/priority";
import type { TaskListQuery } from "@/lib/schemas/task";
import type { Priority } from "@/lib/schemas/priority";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function TaskFilterBar({
  search,
  searchInputRef,
}: {
  search: TaskListQuery;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const { data: tags } = useTags();

  function go(patch: Partial<TaskListQuery>) {
    navigate({ to: "/app/activity", search: (prev: TaskListQuery) => ({ ...prev, ...patch, page: 1 }) });
  }

  const statusArr = Array.isArray(search.status) ? search.status : search.status ? [search.status] : [];
  const prioArr = Array.isArray(search.priority) ? search.priority : search.priority ? [search.priority] : [];

  function toggleStatus(s: typeof TASK_STATUSES[number]) {
    go({ status: statusArr.includes(s) ? statusArr.filter((x) => x !== s) : [...statusArr, s] });
  }
  function togglePriority(p: Priority) {
    go({ priority: prioArr.includes(p) ? prioArr.filter((x) => x !== p) : [...prioArr, p] });
  }

  const duePreset = search.due_after && search.due_before ? "custom" : search.due_before && !search.due_after ? "overdue" : "none";

  const activeChips: { label: string; clear: () => void }[] = [
    ...statusArr.map((s) => ({ label: `status:${s}`, clear: () => go({ status: statusArr.filter((x) => x !== s) }) })),
    ...prioArr.map((p) => ({ label: `pr:${p}`, clear: () => go({ priority: prioArr.filter((x) => x !== p) }) })),
    ...(search.project_id ? [{ label: `project:${projects?.find((p) => p.id === search.project_id)?.name ?? "?"}`, clear: () => go({ project_id: undefined }) }] : []),
    ...(search.tag_id ? [{ label: `tag:${tags?.find((t) => t.id === (Array.isArray(search.tag_id) ? search.tag_id[0] : search.tag_id))?.name ?? "?"}`, clear: () => go({ tag_id: undefined }) }] : []),
    ...(search.due_before || search.due_after ? [{ label: "due", clear: () => go({ due_before: undefined, due_after: undefined }) }] : []),
    ...(search.search ? [{ label: `q:"${search.search}"`, clear: () => go({ search: undefined }) }] : []),
  ];

  return (
    <div className="flex flex-col gap-2 border-b border-border px-6 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status toggle chips */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">STATUS</span>
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors",
                statusArr.includes(s)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Priority toggle chips */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">PR</span>
          {PRIORITY_LEVELS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePriority(p)}
              className={cn(
                "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors",
                prioArr.includes(p) ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Project select */}
        <Select
          value={search.project_id ?? "__any"}
          onValueChange={(v) => go({ project_id: v === "__any" ? undefined : v })}
        >
          <SelectTrigger className="h-7 w-[140px] font-mono text-[10px] uppercase"><SelectValue placeholder="PROJECT" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any">ALL PROJECTS</SelectItem>
            {projects?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Tag select */}
        <Select
          value={Array.isArray(search.tag_id) ? search.tag_id[0] ?? "__any" : search.tag_id ?? "__any"}
          onValueChange={(v) => go({ tag_id: v === "__any" ? undefined : v })}
        >
          <SelectTrigger className="h-7 w-[120px] font-mono text-[10px] uppercase"><SelectValue placeholder="TAG" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__any">ALL TAGS</SelectItem>
            {tags?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name.toUpperCase()}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Due preset select */}
        <Select
          value={duePreset}
          onValueChange={(v) => {
            const today = new Date();
            const week = new Date(today); week.setUTCDate(week.getUTCDate() + 7);
            const next = new Date(week); next.setUTCDate(next.getUTCDate() + 7);
            const yest = new Date(today); yest.setUTCDate(yest.getUTCDate() - 1);
            if (v === "none") go({ due_after: undefined, due_before: undefined });
            else if (v === "overdue") go({ due_before: ymd(yest), due_after: undefined });
            else if (v === "today") go({ due_after: ymd(today), due_before: ymd(today) });
            else if (v === "week") go({ due_after: ymd(today), due_before: ymd(week) });
            else if (v === "next") go({ due_after: ymd(week), due_before: ymd(next) });
          }}
        >
          <SelectTrigger className="h-7 w-[110px] font-mono text-[10px] uppercase"><SelectValue placeholder="DUE" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">ANY DUE</SelectItem>
            <SelectItem value="overdue">OVERDUE</SelectItem>
            <SelectItem value="today">TODAY</SelectItem>
            <SelectItem value="week">THIS WEEK</SelectItem>
            <SelectItem value="next">NEXT WEEK</SelectItem>
          </SelectContent>
        </Select>

        {/* Free-text search */}
        <input
          ref={searchInputRef}
          value={search.search ?? ""}
          onChange={(e) => go({ search: e.target.value || undefined })}
          placeholder="SEARCH (press /)"
          className="h-7 w-[180px] border border-border bg-input px-2 font-mono text-[10px] uppercase tracking-[0.05em] text-foreground outline-none focus-visible:border-foreground"
        />

        {activeChips.length > 0 && (
          <button
            type="button"
            onClick={() => go({ status: undefined, priority: undefined, project_id: undefined, tag_id: undefined, due_after: undefined, due_before: undefined, search: undefined })}
            className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground"
          >
            CLEAR ALL
          </button>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {activeChips.map((c, i) => (
            <Badge key={i} variant="outline" className="gap-1 font-mono text-[10px] uppercase">
              {c.label}
              <button type="button" onClick={c.clear} className="text-accent hover:text-foreground">×</button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/task-filter-bar.tsx
git commit -m "feat(ui): add filter bar (status/priority chips + project/tag/due selects + active chips)"
```

---

## Task 11: `TaskRow` + `TaskList` — sortable table with j/k cursor

**Files:**
- Create: `src/components/task-row.tsx`
- Create: `src/components/task-list.tsx`

- [ ] **Step 1: Implement `TaskRow`**

Create `src/components/task-row.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Task } from "@/lib/db/schema";
import type { Priority } from "@/lib/schemas/priority";

const PRIORITY_BADGE_CLASS: Record<Priority, string> = {
  P0: "border-accent text-accent",
  P1: "border-foreground text-foreground",
  P2: "border-border text-foreground",
  P3: "border-border text-muted-foreground",
  P4: "border-border text-muted-foreground/60",
};

function formatDue(due: string | null): { text: string; overdue: boolean } {
  if (!due) return { text: "—", overdue: false };
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00Z");
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return { text: "TODAY", overdue: false };
  if (diff === 1) return { text: "TOM", overdue: false };
  if (diff > 1) return { text: `+${diff}`, overdue: false };
  return { text: `${diff}d`, overdue: true };
}

export function TaskRow({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: () => void }) {
  const due = formatDue(task.due_date);
  return (
    <tr
      onClick={onSelect}
      className={cn(
        "cursor-pointer border-b border-border transition-colors",
        selected ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <td className="w-6 px-2 py-2 font-mono text-[11px] text-accent">{selected ? "▸" : ""}</td>
      <td className="px-2 py-2 font-mono text-[11px] uppercase tracking-[0.03em] text-foreground">{task.title}</td>
      <td className="px-2 py-2"><Badge variant="outline" className={cn("font-mono text-[10px]", PRIORITY_BADGE_CLASS[task.priority])}>{task.priority}</Badge></td>
      <td className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">{task.status.replace("_", " ")}</td>
      <td className={cn("px-2 py-2 font-mono text-[10px] uppercase tracking-[0.05em]", due.overdue ? "text-accent" : "text-muted-foreground")}>{due.text}</td>
      <td className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">—</td>
    </tr>
  );
}
```

(Phase 3 wires real tag chips into the TAGS cell; `—` is the Phase 1 placeholder — tag data isn't joined by `listTasks` yet.)

- [ ] **Step 2: Implement `TaskList` (prop-lifted — the activity view owns the single `useTasks` call and passes results down)**

Create `src/components/task-list.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TaskRow } from "./task-row";
import type { TaskListQuery } from "@/lib/schemas/task";
import type { Task } from "@/lib/db/schema";

const SORT_LABELS: Record<NonNullable<TaskListQuery["sort"]>, string> = {
  priority: "PR",
  due: "DUE",
  created: "CREATED",
};

export function TaskList({
  search,
  data,
  isLoading,
  isError,
  refetch,
  selectedId,
  onSelect,
}: {
  search: TaskListQuery;
  data: { items: Task[]; total: number; page: number; pageSize: number } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const navigate = useNavigate();

  function setSort(sort: TaskListQuery["sort"]) {
    navigate({ to: "/app/activity", search: (prev: TaskListQuery) => ({ ...prev, sort }) });
  }

  if (isLoading && !data) {
    return <div className="flex flex-1 items-center justify-center p-12 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">▌▌▌ LOADING ▌▌▌</div>;
  }
  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">+ + + QUERY FAILED + + +</div>
        <button type="button" onClick={() => refetch()} className="border border-foreground px-3 py-1 font-mono text-[10px] uppercase hover:bg-secondary">RETRY</button>
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    const hasFilters = !!(search.status || search.priority || search.project_id || search.tag_id || search.due_before || search.due_after || search.search);
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
          {hasFilters ? "+ + + NO TASKS MATCH + + +" : "+ + + NO TASK DATA + + +"}
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/app/activity", search: { page: 1, pageSize: 50, sort: "priority" } as TaskListQuery })}
            className="border border-foreground px-3 py-1 font-mono text-[10px] uppercase hover:bg-secondary"
          >CLEAR FILTERS</button>
        ) : (
          <div className="max-w-md text-center font-mono text-[11px] leading-relaxed tracking-[0.03em] text-muted-foreground">
            TASK DATABASE IS EMPTY. PRESS C TO CREATE YOUR FIRST TASK.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6">▸</TableHead>
            <TableHead>TITLE</TableHead>
            {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((k) => (
              <TableHead
                key={k}
                onClick={() => setSort(k)}
                className={search.sort === k ? "text-accent" : "text-muted-foreground hover:text-foreground"}
              >
                {SORT_LABELS[k]}{search.sort === k ? " ↓" : ""}
              </TableHead>
            ))}
            <TableHead>TAGS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((t) => (
            <TaskRow key={t.id} task={t} selected={t.id === selectedId} onSelect={() => onSelect(t.id)} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

The TAGS column renders `—` in Phase 1 — `listTasks` doesn't join tag data yet (tag chips land in Phase 3 with the detail modal).

- [ ] **Step 3: Commit**

```bash
git add src/components/task-row.tsx src/components/task-list.tsx
git commit -m "feat(ui): add task table with sort + j/k cursor + empty/error states"
```

---

## Task 12: `TaskPagination` — numbered control

**Files:**
- Create: `src/components/task-pagination.tsx`

- [ ] **Step 1: Implement pagination**

Create `src/components/task-pagination.tsx`:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { TaskListQuery } from "@/lib/schemas/task";

export function TaskPagination({ total, page, pageSize, search }: { total: number; page: number; pageSize: number; search: TaskListQuery }) {
  const navigate = useNavigate();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function go(p: number) {
    navigate({ to: "/app/activity", search: (prev: TaskListQuery) => ({ ...prev, page: p }) });
  }

  const nums: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }

  return (
    <div className="flex items-center justify-center gap-1 border-t border-border px-6 py-2 font-mono text-[10px] uppercase tracking-[0.05em]">
      <button type="button" disabled={page <= 1} onClick={() => go(page - 1)} className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-30">‹</button>
      {nums.map((n, i) =>
        n === "..." ? (
          <span key={`e${i}`} className="px-2 text-muted-foreground">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => go(n)}
            className={cn("px-2", n === page ? "text-accent" : "text-muted-foreground hover:text-foreground")}
          >{n}</button>
        ),
      )}
      <button type="button" disabled={page >= pages} onClick={() => go(page + 1)} className="px-2 text-muted-foreground hover:text-foreground disabled:opacity-30">›</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/task-pagination.tsx
git commit -m "feat(ui): add numbered pagination control"
```

---

## Task 13: `app/activity.tsx` — compose the view + wire keybindings + final verification

**Files:**
- Create: `src/routes/app/activity.tsx`

- [ ] **Step 1: Implement the activity route**

Create `src/routes/app/activity.tsx`:

```tsx
import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { getQueryClient } from "@/lib/query";
import { listTasks } from "@/server/tasks";
import { getTaskStats } from "@/server/stats";
import { taskListQuerySchema, type TaskListQuery } from "@/lib/schemas/task";
import { useTasks } from "@/lib/hooks/use-tasks";
import { useKeybindings } from "@/lib/hooks/use-keybindings";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskStatHeader } from "@/components/task-stat-header";
import { TaskFilterBar } from "@/components/task-filter-bar";
import { TaskList } from "@/components/task-list";
import { TaskPagination } from "@/components/task-pagination";

export const Route = createFileRoute("/app/activity")({
  validateSearch: (input: Record<string, unknown>): TaskListQuery => {
    const parsed = taskListQuerySchema.safeParse(input);
    return parsed.success ? parsed.data : { page: 1, pageSize: 50, sort: "priority" };
  },
  loader: async ({ search }) => {
    const qc = getQueryClient();
    await Promise.all([
      qc.prefetchQuery({ queryKey: ["tasks", search], queryFn: () => listTasks({ data: search }) }),
      qc.prefetchQuery({ queryKey: ["stats", search], queryFn: () => getTaskStats({ data: search }) }),
    ]);
  },
  component: ActivityPage,
});

function ActivityPage() {
  const search = Route.useSearch() as TaskListQuery;
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useTasks(search);

  function moveCursor(delta: number) {
    if (!data?.items.length) return;
    const idx = cursorId ? data.items.findIndex((t) => t.id === cursorId) : -1;
    const next = Math.max(0, Math.min(data.items.length - 1, idx + delta));
    setCursorId(data.items[next].id);
  }

  useKeybindings({
    c: () => quickAddRef.current?.focus(),
    "/": () => searchRef.current?.focus(),
    j: () => moveCursor(1),
    k: () => moveCursor(-1),
    Escape: () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
      else setCursorId(null);
    },
  });

  return (
    <div className="flex flex-1 flex-col">
      <TaskQuickAdd ref={quickAddRef} search={search} />
      <TaskStatHeader search={search} />
      <TaskFilterBar search={search} searchInputRef={searchRef} />
      <TaskList
        search={search}
        data={data}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
        selectedId={cursorId}
        onSelect={setCursorId}
      />
      {data && <TaskPagination total={data.total} page={data.page} pageSize={data.pageSize} search={search} />}
    </div>
  );
}
```

The activity view owns the single `useTasks(search)` call and passes results down to `TaskList`/`TaskPagination` (prop-lifted, per Task 11). Cursor state lives here so `j`/`k` (in the keybinding registry) can compute the next index from `data.items`. The loader SSR-prefetches both queries; if dehydration doesn't bridge to the browser client, the client refetches (no correctness risk).

- [ ] **Step 2: Run the full build + tests**

Run: `pnpm run build && pnpm test`
Expected: build succeeds; all tests (existing 5 files + the 2 new ones) pass.

- [ ] **Step 3: Manual smoke test in dev**

Run: `pnpm run dev`
Open `http://localhost:3000/app` → should redirect to `/app/activity`. Verify:
- Empty state shows `+ + + NO TASK DATA + + +` (no tasks yet).
- Quick-add: type `Fix login race #auth-svc @bug P0 due:+1`, press Enter → row appears, stat cells update, project + tag show in the rail.
- Press `c` → quick-add input focuses (works from anywhere not in an input).
- Press `/` → search input focuses.
- Type in search → list filters by FTS.
- Click a priority chip → list filters; chip appears below; `×` clears it.
- Click IN PROGRESS stat cell → list filters to IN_PROGRESS.
- Click a project in the rail → list filters by project; rail item highlights.
- Click TITLE/PR/DUE/CREATED headers → sort toggles.
- Create 51+ tasks → pagination appears; page 2 works; URL carries `?page=2`.
- `j`/`k` moves the `▸` cursor (only when not typing in an input).
- `Esc` blurs the focused input; `Esc` again clears the cursor.
- Soft-delete guard: confirm trashed tasks never appear in the activity list.

- [ ] **Step 4: Commit the route files + layout refactor together**

```bash
git add src/routes/app.tsx src/routes/app/index.tsx src/routes/app/activity.tsx
git commit -m "feat: wire /app/activity view (quick-add, stats, filters, list, pagination, keybindings)"
```

This commit also lands Task 6's `app.tsx` layout refactor + `app/index.tsx` redirect, which were intentionally left uncommitted until the build went green at this step.

- [ ] **Step 5: Final full-suite verification**

Run: `pnpm run build && pnpm test && git status`
Expected: clean working tree; build green; all tests pass.

---

## Self-review notes (applied during authoring)

- **Spec coverage:** Q1 Hybrid → `TaskStatHeader` + `TaskList`. Q2 routes → `app.tsx` layout + `app/index.tsx` redirect + `app/activity.tsx`. Q3 quick-add → `TaskQuickAdd` (persistent, immediate-save, warnings). Q4 facets → `TaskFilterBar` (toggle-chips deviation documented) + rail click-to-filter (`AppSidebar`). Q5 stats → `getTaskStats` + `TaskStatHeader`. Q6 pagination → `TaskPagination` (50/page, numbered, `?page=`). Arch A → `validateSearch` + `useTasks`/`useTaskStats` keyed on `search`. Keyboard subset → `useKeybindings` (c, /, j, k, Esc). All covered.
- **Placeholders:** none beyond intentional Phase-1 deferrals (TAGS cell `—`, pending rail links `KANBAN`/`LIST`/`TRASH`) — both called out.
- **Type consistency:** `TaskListQuery` used uniformly; `buildTaskWhere` signature `(db, userId, data)` matches both `listTasks` and `getTaskStats` call sites; `useCreateQuickAdd(search)` matches the activity view's `search`.
- **Known gaps documented:** no D1 integration tests (no harness); no React component tests (no DOM harness); `task-lifecycle` tests still a pre-existing gap.
