# Phase 1 — Core Shell + Unified Activity View

**Status:** Approved design (2026-07-17)
**Spec scope:** Phase 1 of the 4-phase UI-layer build-out
**Predecessors:** backend server layer (tasks, bulk, projects, tags, auth), auth UI, marketing landing — all complete
**Source spec:** `/docs/DESIGN.md` (data model §2, lifecycle §3, views §4.2, filters §4.3, priority §4.4, quick-add §4.6, keybindings §5)

## Context

The server layer is complete and AGENTS.md-compliant: task CRUD + lifecycle, bulk ops, project/tag CRUD, FTS5 search, all `owner_id`-scoped and soft-delete-filtered. Auth is wired end-to-end (login/signup/guard/session). The `/app` route is a static placeholder — fake "0000" readouts, non-functional rail, buttons with no handlers. **No task UI of any kind exists.**

Phase 1 builds the shared app shell + the Unified Activity view (the default landing), fully wired to the existing server layer. This is the spine that phases 2–4 (kanban, detail modal, bulk/trash/cheat-sheet) plug into.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|---|---|
| Q1 | Shape of Unified Activity view | **Hybrid** — 4-cell filter-aware stat header + flat sortable/filterable task table |
| Q2 | URL architecture | **`/app` layout route + `/app/activity` default** — TanStack layout-route pattern, single auth guard, children `kanban`/`list`/`trash`/`inbox`/`projects/:id` land in later phases |
| Q3 | Quick-add input | **Persistent top bar** (always visible above stat header); **immediate-save** on Enter (optimistic insert; warnings shown inline if tokens dropped, task still saves per DESIGN §4.6) |
| Q4 | Filter facets UI | **Top filter row** (5 dropdowns) + removable chips for active facets; rail PROJECTS/TAGS are **click-to-filter shortcuts** (set the same URL param the dropdown would) |
| Q5 | Stat cells | **4 filter-aware cells**: IN PROGRESS / OVERDUE / DUE THIS WEEK / TOTAL ACTIVE — all click-to-filter |
| Q6 | Pagination | **50/page, numbered control** (`‹ 1 2 3 … n ›`), `?page=` in URL |
| Arch | Client state architecture | **URL search params as single source of truth** — `validateSearch` (Zod) parses; `useQuery(['tasks', search])` + `useQuery(['stats', search])` fetch; rail clicks + future `g`-nav are `navigate({ search })` calls; selection cursor (`j`/`k`) stays local React state |

## Route structure

```
src/routes/
  app.tsx              # LAYOUT: top nav, left rail, bottom status bar, <Outlet/>. Auth guard stays in beforeLoad.
  app/
    index.tsx          # /app → redirect to /app/activity
    activity.tsx       # /app/activity — the activity view (validateSearch + loader prefetch + composition)
```

`app.tsx` keeps its existing `beforeLoad` auth guard + `session` context. The placeholder content (readouts strip, empty-state) moves **out** of the layout into `activity.tsx` — stats are filter-aware and belong to the view, not the chrome.

## New / changed files

```
src/routes/app.tsx                  # MODIFY: strip placeholder content, add <Outlet/>, keep chrome+guard+GSAP (narrowed to chrome only)
src/routes/app/index.tsx            # NEW: redirect → /app/activity
src/routes/app/activity.tsx         # NEW: activity view (validateSearch + loader + composition)

src/components/
  app-sidebar.tsx                   # NEW: functional rail (views nav, projects, tags, click-to-filter)
  task-quick-add.tsx                # NEW: persistent quick-add input bar + warnings
  task-filter-bar.tsx               # NEW: 5 facet dropdowns + active filter chips
  task-stat-header.tsx              # NEW: 4 filter-aware stat cells (click-to-filter)
  task-list.tsx                     # NEW: sortable table + j/k cursor + selection state
  task-row.tsx                      # NEW: one row (title, priority badge, status, due, tags)
  task-pagination.tsx               # NEW: numbered "‹ 1 2 3 … n ›" control
  ui/badge.tsx, ui/select.tsx, ui/table.tsx   # ADD via shadcn (targeted — only what's used)

src/lib/hooks/
  use-tasks.ts                      # NEW: useTasks, useTaskStats, useCreateQuickAdd, useProjects, useTags
  use-keybindings.ts                # NEW: extensible key registry + input-focus guard

src/server/
  stats.ts                          # NEW: getTaskStats(search) — filter-aware 4 counts

src/lib/
  task-query.ts                     # NEW: shared buildTaskWhere(db, userId, data) — extracted from listTasks
```

## Reused (no changes)

`src/server/{tasks,projects,tags,session}.ts`, `src/server/bulk.ts` (deferred to P4), `src/lib/schemas/{task,priority,quick-add,auth}.ts`, `src/lib/{fts,task-lifecycle,query,gsap,utils}.ts`, `src/lib/db/*`, `src/lib/auth/*` — all already built. Phase 1 only **adds** `getTaskStats` + `buildTaskWhere` and wires everything to the UI.

## Data flow

### URL → queries

`activity.tsx` declares `validateSearch` (Zod) mirroring `taskListQuerySchema`: `status` (single|array), `priority` (single|array), `project_id`, `tag_id` (single|array), `due_before`, `due_after`, `search`, `page` (default 1), `sort` (priority|due|created, default priority). Coerced from string params; array params supported via TanStack Router's repeated-key handling.

```
URL: /app/activity?status=IN_PROGRESS&priority=P0&priority=P1&project=<uuid>&tag=<uuid>&due_before=2026-07-24&search=login&page=2&sort=priority

  activity.tsx
    validateSearch → parsed search object
    loader() { Promise.all([
      prefetchQuery(['tasks', search], () => listTasks(search)),
      prefetchQuery(['stats', search], () => getTaskStats(search)),
    ]) }   // SSR prefetch, first paint has data

  useTasks(search)      → useQuery(['tasks', search], () => listTasks(search))   → { items, total, page, pageSize }
  useTaskStats(search)  → useQuery(['stats', search], () => getTaskStats(search)) → { inProgress, overdue, dueThisWeek, totalActive }
```

Both queries share the `search` object as key, so a single URL change (chip removed, page bumped) invalidates both and they refetch in parallel. `staleTime: 30s` (existing `query.ts`) keeps rapid back/forward snappy.

### New server fn: `getTaskStats`

`src/server/stats.ts` — filter-aware counts against the **same** `where` clause as `listTasks` (minus pagination/sort), via the shared `buildTaskWhere` helper. Returns 4 counts in one round-trip:

- `inProgress`: `status = IN_PROGRESS`
- `overdue`: `due_date < today AND status NOT IN (COMPLETED, DROPPED)`
- `dueThisWeek`: `due_date BETWEEN today AND today+7 AND status NOT IN (COMPLETED, DROPPED)`
- `totalActive`: `status IN (PLANNING, IN_PROGRESS)`

All counts apply the current filter facets (narrowing the list narrows stats too). Validator: same `taskListQuerySchema` as `listTasks`.

### Refactor: `buildTaskWhere`

The `where`-building logic in `listTasks` (`src/server/tasks.ts:39–63`) duplicates what `getTaskStats` needs. Extract a shared `buildTaskWhere(db, userId, data)` helper into `src/lib/task-query.ts` so both `listTasks` and `getTaskStats` call it — no logic duplication, single place to maintain filter conditions. Targeted improvement to code being actively worked, not unrelated refactoring. `listTasks` is rewritten to call `buildTaskWhere` (behavior identical, covered by existing `taskListQuerySchema` tests).

### Quick-add flow (immediate-save)

```
QuickAdd input: "Fix login race #auth-svc @bug P0 due:+1"
  │
  │  client: parseQuickAdd(text) → { title, projectName, tags, priority, dueDate, warnings }
  │           (parser already exists in src/lib/schemas/quick-add.ts)
  ▼
  useCreateQuickAdd() → useMutation(() => createTaskFromQuickAdd({ title, projectName, tags, priority, dueDate }))
  │
  │  onMutate: optimistic insert into ['tasks', search] cache (placeholder row)
  │  onSuccess: invalidate ['tasks', search] + ['stats', search] → refetch real data
  │  onError: rollback optimistic insert, show error inline under input
  ▼
  server: createTaskFromQuickAdd (already exists) → atomic db.batch (project get-or-create, tags get-or-create, task, tag-links) → returns task row
  │
  ▼
  UI: if warnings.length > 0 → inline warning line under input, auto-dismiss 4s. Task already saved (DESIGN §4.6).
```

### Rail click-to-filter

Rail PROJECTS/TAGS lists come from `useQuery(['projects'], listProjects)` / `useQuery(['tags'], listTags)` (server fns already exist). Clicking a rail item: `navigate({ to: '/app/activity', search: prev => ({ ...prev, project_id: uuid, page: 1 }) })` — TanStack Router merges search, preserving other facets, resets to page 1. Active rail item highlighted by comparing `useSearch().project_id` / `tag_id` to item id. Clicking the already-active item clears that facet (toggle).

## Components

### `app.tsx` (layout route — modified)
Strips placeholder readouts strip + empty-state. Keeps: top nav (`[ TODOIFY ]` + operator email + DISCONNECT), left rail (`<AppSidebar />`), bottom status bar (D1/FTS5/SESSION), `<Outlet />` for child views. Auth guard + `session` context stay in `beforeLoad`. GSAP entrance animation narrows to chrome frame only — views own their enter animations.

### `app/index.tsx` (new — 3 lines)
`createFileRoute('/app/')({ beforeLoad: () => redirect({ to: '/app/activity' }) })`. Pure redirect.

### `app/activity.tsx` (new — the view)
`validateSearch` (Zod, mirrors `taskListQuerySchema`). `loader` SSR-prefetches `['tasks', search]` + `['stats', search]`. Component composes top-to-bottom: `<TaskQuickAdd />` → `<TaskStatHeader />` → `<TaskFilterBar />` → `<TaskList />` → `<TaskPagination />`.

### `task-quick-add.tsx`
Persistent input row above stat header. Self-contained. State: `text`, `warnings`. `c` focuses it (via `use-keybindings`). Enter → `parseQuickAdd` → `useCreateQuickAdd().mutate`. Clears on success. Warnings render as mono line below, auto-dismiss 4s. `Esc` blurs (preserves text). Optimistic insert + invalidate + rollback per data-flow section.

### `task-stat-header.tsx`
4 cells from `useTaskStats(search)`. Each is a button: IN PROGRESS → `status=IN_PROGRESS`; OVERDUE → `due_before=<yesterday>` (strict overdue, matches the stat's `due_date < today`); DUE THIS WEEK → `due_after=<today>, due_before=<today+7>`; TOTAL ACTIVE → clears all facets. Count zero-padded to 3 digits (`003`). Loading: `---`.

### `task-filter-bar.tsx`
5 shadcn `Select` dropdowns: status (multi), priority (multi), project (from `listProjects`), tag (from `listTags`), due (presets: overdue / today / this week / next week / clear). Each change → `navigate({ search: prev => ({ ...prev, <facet> }) })` + reset `page` to 1. Active filters render as removable chips; "clear all" when ≥1 facet active. Due preset → filter mapping: overdue = `due_before=<yesterday>` (strict, matches the stat's `due_date < today`); today = `due_after=<today>, due_before=<today>`; this week = `due_after=<today>, due_before=<today+7>`; next week = `due_after=<today+7>, due_before=<today+14>`; clear = remove `due_before` + `due_after`.

### `task-list.tsx` + `task-row.tsx`
shadcn `Table`. Columns: `▸` (cursor marker), TITLE, PR (priority badge), STATUS, DUE, TAGS. Header click toggles `sort` (priority/due/created). `j`/`k` moves local `selectedId` cursor (React state, not URL); selected row gets left-border accent + `▸`. `TaskRow`: priority color-coded badge (P0 red → P4 gray, via `priority_weight`), status mono label, due relative (`tom`/`+1`/`-2d`), tags as `@name` chips. Empty (no rows): `+ + + NO TASKS MATCH + + +` + CLEAR FILTERS.

### `task-pagination.tsx`
Numbered `‹ 1 2 3 … n ›` from `total`/`pageSize`. Page click → `navigate({ search: prev => ({ ...prev, page: n }) })`. Ellipsis when n > 7. Current page highlighted. `‹` disabled on page 1, `›` on last.

### `app-sidebar.tsx`
Replaces static rail. Sections:
- **VIEWS**: `ACTIVITY` (active on `/app/activity`); `KANBAN`/`LIST`/`TRASH` rendered greyed with `·` pending marker — honest about what's built (land in later phases), clicking is a no-op with a brief "not yet available" tooltip.
- **PROJECTS**: from `useQuery(['projects'], listProjects)`. Button → `navigate({ search: prev => ({ ...prev, project_id, page: 1 }) })`. Active = `useSearch().project_id === item.id`. Toggle: clicking active clears.
- **TAGS**: from `useQuery(['tags'], listTags)`. Same toggle pattern with `tag_id`.

### shadcn/ui additions (targeted)
`badge` (priority + tag chips), `select` (filter dropdowns), `table` (task list). Installed via `npx shadcn@latest add badge select table` — only what's used. `dropdown-menu` may drop out if `select` alone suffices.

### `src/lib/hooks/use-tasks.ts`
- `useTasks(search)` → `useQuery(['tasks', search], () => listTasks(search))`
- `useTaskStats(search)` → `useQuery(['stats', search], () => getTaskStats(search))`
- `useCreateQuickAdd()` → `useMutation(createTaskFromQuickAdd)` with optimistic-insert/invalidate/rollback wired
- `useProjects()` / `useTags()` → thin wrappers over `listProjects`/`listTags`

### `src/lib/hooks/use-keybindings.ts`
Single `useEffect` attaching `keydown` to `window`. Phase 1 registry:

| Key | Action | Guard |
|---|---|---|
| `c` | Focus quick-add input | only when no input focused |
| `/` | Focus search input (in filter bar) | only when no input focused |
| `j` | Move row cursor down | only when no input focused |
| `k` | Move row cursor up | only when no input focused |
| `Esc` | Blur focused input / clear row cursor | always |

Built as an extensible registry (key → handler map) so phases 2–4 add `1`–`4`, `Shift+0–4`, `x`, `d`, `g p/a/i/t`, `?`, `Enter`, `e`, `h`/`l` without restructuring. **Input-focus guard** (DESIGN §5): if `document.activeElement` is `<input>`/`<textarea>` or `isContentEditable`, only `Esc` fires — `c`/`j`/`k`/`/` pass through to the browser. `Enter` deferred with detail modal (P3); cursor ships now so infra is ready.

## Error handling & empty states

- **Server fn errors** (`listTasks`/`getTaskStats`/`createTaskFromQuickAdd`): TanStack Query `isError` → centered error panel `+ + + QUERY FAILED + + +` + message + RETRY (`refetch()`). Quick-add mutation errors: inline under input + rollback optimistic row.
- **Auth/permission**: `requireUserId` throws → layout `beforeLoad` catches missing session → redirect `/login`. Stale-session mid-use → query error → error panel with "session expired" + redirect-to-login button.
- **Empty — no tasks at all** (total=0, no filters): `+ + + NO TASK DATA + + +` + hint to press `c`.
- **Empty — no tasks match filters** (total=0, ≥1 facet active): `+ + + NO TASKS MATCH + + +` + CLEAR FILTERS.
- **Loading** (first load, no cache): skeleton rows (`▌▌▌`) + `---` in stat cells. Subsequent refetches: keep stale data with opacity dim via `isFetching` + `placeholderData: keepPreviousData`.
- **Quick-add warnings**: non-fatal parser drops (invalid `due:+x`, repeated `#project`) → inline warning line, auto-dismiss 4s, task still saved.

## Testing

Follows the existing vitest pattern (pure-logic unit tests; no DOM/integration tests in current suite). Phase 1 adds:

- **`src/lib/hooks/use-keybindings.test.ts`** — extract key-handler registry + input-focus guard as a pure function (`resolveBinding(event, isInputFocused, registry) → handler | null`) testable without a DOM. Cover: each Phase 1 key fires when not in input; `c`/`j`/`k`/`/` suppressed when `isInputFocused`; `Esc` always fires; unknown keys no-op.
- **`src/lib/task-query.test.ts`** — unit tests for `buildTaskWhere` condition-building (filter facets → expected Drizzle `where` shape).
- **Deferred:** `getTaskStats` integration tests (needs D1 mock harness — not yet in repo); React component tests (needs `@testing-library/react` + jsdom — out of scope); `task-lifecycle` tests (pre-existing gap, not Phase 1 scope).

## Out of Phase 1 scope (explicitly deferred)

| Feature | Phase |
|---|---|
| Kanban board + drag-drop status | P2 |
| List view (separate from activity table) | P2 |
| Trash page | P2 |
| Task detail / edit modal + `Enter`/`e` keys | P3 |
| Projects CRUD UI + Project view | P3 |
| Tags CRUD UI + tag autocomplete | P3 |
| Bulk multi-select + `x` key + bulk ops UI | P4 |
| `?` cheat-sheet modal + remaining keys (`1`–`4`, `Shift+0–4`, `d`, `g p/a/i/t`, `h`/`l`) | P4 |
| `Enter` on selected row (opens detail) | P3 |
| D1 mock test harness | future |

## Open questions

None — all Phase 1 decisions settled during brainstorming.
