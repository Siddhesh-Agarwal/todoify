# Phase 1 Review Fixes — Design Spec

**Status:** Approved design (2026-07-18)
**Spec scope:** 6 fixes from the Phase 1 final code review
**Predecessors:** Phase 1 core shell + unified activity view (merged to `main` at `d76a1de`)
**Source review:** Final code review of the Phase 1 implementation (subagent dispatch, commit range `d5d4cdf..3f36770`)

## Context

Phase 1 (the core shell + Unified Activity view) was implemented across 13 tasks and merged to `main`. The final holistic code review flagged 6 non-blocking issues: 4 "Important" (missing SSR loader prefetch, stat-header semantic mismatch already fixed pre-merge, search-per-keystroke server calls, sort-header keyboard a11y) and several "Minor" (optimistic placeholder priority_weight already fixed pre-merge, `dash-readout` no-op class, due-preset dropdown label roundtrip, `ymd` duplication, `useSearch` unsound cast). Two of those were fixed in the pre-merge commit `909ac3d` (stat-header semantics + optimistic priority_weight). This spec addresses the remaining 6.

## Decisions (from brainstorming)

| # | Question | Decision |
|---|---|---|
| Q1 | SSR loader prefetch scope | **Include** — research the TanStack Start `loader`/`loaderDeps` API first; implement if tractable; defer just that fix if it's a rabbit hole |
| Q2 | Search input debounce interval | **250ms** — standard typeahead feel |
| Q3 | Due-preset dropdown roundtrip approach | **(b) Reverse-match** the current `due_after`/`due_before` to known preset ranges; add a `CUSTOM` SelectItem for the unreachable-via-UI case |
| Q4 | `dash-readout` no-op class | **(a) Drop the class** — it's dead (no CSS rule, no GSAP target); the chrome animation still plays |
| — | Commit grouping | **B — 3 grouped commits in one PR**, by category: perf / UX / a11y+refactor |
| — | Sort-header a11y approach (decided in design, not asked) | Wrap each sortable column label in a `<button type="button">` inside the `<th>` — native Tab focus + Enter/Space activation |
| — | `ymd` hoist destination (decided in design, not asked) | Add to existing `src/lib/utils.ts` (the canonical small-shared-helpers file, alongside `cn`) rather than a new `src/lib/date.ts` |

## Commit 1 — `perf: debounce search input + restore SSR loader prefetch`

### Fix 1a: Search input debounce (250ms)

**File:** `src/components/task-filter-bar.tsx`

The search `<input>` currently drives `go({ search: e.target.value || undefined })` on every `onChange`, producing one server `listTasks` call per keystroke (each keystroke = a unique `['tasks', search]` query key, so `staleTime` doesn't help).

**Fix:**
- Add local `useState<string>` for the input's text value (the "what the user sees" state).
- Add a `useEffect` with a 250ms `setTimeout` that calls `go({ search: text || undefined })` after the user stops typing. Cleanup clears the timeout on each keystroke so only the final call fires.
- The `<input>` becomes controlled by the local state (not directly by `search.search`). The URL remains the source of truth — it just updates 250ms after typing stops, not per keystroke.
- **External sync:** when `search.search` changes from outside the input (CLEAR ALL button, stat-header click, rail click), sync the local state from the URL so the input reflects the active filter. A `useEffect` watching `search.search` updates the local state when the URL value differs from the local text (avoids feedback loops).

### Fix 1b: Restore SSR loader prefetch

**File:** `src/routes/app/activity.tsx`

The route currently has only `validateSearch` + `component` — no `loader`. The plan's original `loader: async ({ search }) => { prefetchQuery(...) }` was removed because `LoaderFnContext` doesn't expose `search` directly in this TanStack Start version.

**Fix (research-first):**
- Investigate the installed `@tanstack/react-start` version's types to confirm the correct API for accessing search params inside a `loader`. The likely API is `loaderDeps` (a function that reads the route's search params and returns a typed object) paired with `loader: async ({ deps })` reading from `deps`.
- If tractable: restore `loader` with the correct API, prefetch `['tasks', search]` + `['stats', search]` via `getQueryClient().prefetchQuery(...)`. Re-add the removed imports (`getQueryClient` from `@/lib/query`, `listTasks` from `@/server/tasks`, `getTaskStats` from `@/server/stats`).
- **Escape hatch:** if the API research reveals it's a rabbit hole (e.g. the version's types are broken, or it requires restructuring the route's `validateSearch` incompatibly), defer just this fix. The other 5 ship without it. Report back with the specific blocker.

## Commit 2 — `fix: due-preset dropdown roundtrip + drop dead dash-readout class`

### Fix 2a: Due-preset reverse-match

**Files:** `src/components/task-filter-bar.tsx` (modify), `src/components/task-filter-bar.test.ts` (new)

The current `duePreset` heuristic (line 46) maps `due_after && due_before` → `"custom"`, but there's no `<SelectItem value="custom">`. After picking TODAY/WEEK/NEXT, the trigger falls back to the placeholder "DUE" — confusing UX.

**Fix:**
- Replace the inline heuristic with a pure helper `computeDuePreset(search: TaskListQuery): string` that reverse-matches the current `due_after`/`due_before` to known preset ranges:
  - `due_after === undefined && due_before === undefined` → `"none"`
  - `due_after === undefined && due_before === ymd(yesterday)` → `"overdue"`
  - `due_after === ymd(today) && due_before === ymd(today)` → `"today"`
  - `due_after === ymd(today) && due_before === ymd(today+7)` → `"week"`
  - `due_after === ymd(today+7) && due_before === ymd(today+14)` → `"next"`
  - anything else → `"custom"` (only reachable via external URL editing — the UI never produces it)
- Add `<SelectItem value="custom">CUSTOM</SelectItem>` to the dropdown so the trigger shows "CUSTOM" for the unreachable case (cleaner than the placeholder "DUE").
- Export `computeDuePreset` so it's testable.

**Tests:** Create `src/components/task-filter-bar.test.ts` — unit tests for `computeDuePreset` covering all 6 branches. Pure function, no DOM, follows the existing vitest pattern (`src/lib/*.test.ts`).

### Fix 2b: Drop `dash-readout` class

**File:** `src/components/task-stat-header.tsx`

The `dash-readout` class on the stat cell buttons (line 44) is a no-op — no CSS rule in `src/styles.css`, no GSAP target in the layout's `useGSAP`. It was carried over from the old `app.tsx` readouts strip.

**Fix:** Remove `dash-readout` from the className. The cells render and function identically without it. The chrome animation (`.dash-frame` + `.dash-section`) still plays on layout mount.

## Commit 3 — `fix(a11y): sort-header keyboard access + hoist ymd helper`

### Fix 3a: Sort header keyboard a11y

**File:** `src/components/task-list.tsx`

Sortable column headers (`PR`/`DUE`/`CREATED`) currently use `onClick` on `<TableHead>` (`<th>`) with no `tabIndex`/`role`/`onKeyDown`. DESIGN §5 says "fully operable without a mouse." A keyboard-only user can't change sort.

**Fix:**
- Wrap each sortable column label in a `<button type="button">` inside the `<TableHead>` (`<th>`). The button gets `onClick={() => setSort(k)}`, `cursor-pointer` styling, and is natively keyboard-focusable (Tab) + activatable (Enter/Space).
- Non-sortable columns (`▸`, `TITLE`, `TAGS`) stay as plain `<th>` text — no button.
- Active sort column keeps the `text-accent` + ` ↓` indicator (moved to the button's className).

### Fix 3b: Hoist `ymd` helper

**Files:** `src/lib/utils.ts` (modify), `src/server/stats.ts` + `src/components/task-stat-header.tsx` + `src/components/task-filter-bar.tsx` (modify)

The `ymd` helper (`d.toISOString().slice(0, 10)`) is duplicated 3× across `stats.ts`, `task-stat-header.tsx`, `task-filter-bar.tsx`. Identical 1-line function.

**Fix:**
- Add `export function ymd(d: Date): string { return d.toISOString().slice(0, 10) }` to `src/lib/utils.ts` (existing file — already the canonical home for small shared helpers like `cn`).
- Remove the local `ymd` definitions from the 3 files. Import from `@/lib/utils` instead.
- No behavior change — same 1-line function, just moved. `pnpm test` stays green.

## Testing

- **New tests:** `src/components/task-filter-bar.test.ts` — unit tests for `computeDuePreset` (6 branches: none/overdue/today/week/next/custom). Pure function, no DOM, vitest node env.
- **Existing tests:** 63 tests across 7 files stay green. The `ymd` hoist is behavior-identical. The debounce + SSR loader + a11y fixes don't touch the TDD units (`buildTaskWhere`, `resolveBinding`).
- **Manual smoke:** after the 3 commits, `pnpm run dev` → verify:
  - Search debounces (results lag ~250ms after typing stops, not per keystroke)
  - Due-preset dropdown shows the selected preset name after picking (TODAY/WEEK/NEXT stick)
  - Sort headers are Tab-focusable + Enter/Space activates the sort
  - Stat cells render correctly (no `dash-readout` regression)
- **Build gate:** `pnpm run build` (`vite build && tsc --noEmit`) green after each commit.

## Files touched (summary)

| File | Fix(es) | Commit |
|---|---|---|
| `src/components/task-filter-bar.tsx` | 1a (debounce), 2a (due-preset roundtrip) | 1 + 2 |
| `src/components/task-filter-bar.test.ts` | 2a (new test file) | 2 |
| `src/routes/app/activity.tsx` | 1b (SSR loader) | 1 |
| `src/components/task-stat-header.tsx` | 2b (drop class), 3b (ymd import) | 2 + 3 |
| `src/components/task-list.tsx` | 3a (sort-header a11y) | 3 |
| `src/server/stats.ts` | 3b (ymd import) | 3 |
| `src/lib/utils.ts` | 3b (add `ymd`) | 3 |

## Out of scope (deferred to later phases)

- `useSearch({ strict: false }) as TaskListQuery` unsound cast in `app-sidebar.tsx` (works correctly at runtime; a type-system improvement, not a behavior bug — defer)
- `TaskRow` keyboard focusability (`tabIndex` + `onKeyDown` for Enter → opens detail modal in Phase 3; defer with the detail modal)
- `aria-pressed` on toggle chips (a11y polish; defer to a dedicated a11y pass)
- Quick-add ref cast cleanup (cosmetic; defer)

## Open questions

None — all decisions settled during brainstorming.
