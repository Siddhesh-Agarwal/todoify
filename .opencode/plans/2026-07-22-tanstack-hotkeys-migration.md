# TanStack Hotkeys Migration + Cheat Sheet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom `useKeybindings` hook with `@tanstack/react-hotkeys`, add type-safe hotkey strings with cross-platform Mod handling, smart input filtering, and a visible cheat sheet powered by `useHotkeyRegistrations()`.

**Architecture:** Install `@tanstack/react-hotkeys`, wrap the app in `HotkeysProvider`, migrate existing keybindings from the custom registry pattern to `useHotkey`/`useHotkeys`/`useHotkeySequence` hooks, add `meta: { name, description }` to every registration for cheat sheet introspection, and build a `KeybindingCheatSheet` component that renders all registered shortcuts grouped by category.

**Tech Stack:** `@tanstack/react-hotkeys@^0.10.0`, `@tanstack/hotkeys@^0.8.0` (core, transitive), React 19, Tailwind v4, shadcn/ui new-york style.

---

## File Map

| File | Purpose |
|------|---------|
| `src/routes/__root.tsx` | Add `HotkeysProvider` wrapper |
| `src/components/keybinding-cheat-sheet.tsx` | New: cheat sheet overlay component |
| `src/routes/app/activity.tsx` | Migrate to `useHotkey` + add `?` binding |
| `src/routes/app.tsx` | Register app-wide shortcuts (sequences, global) |
| `src/lib/hooks/use-keybindings.ts` | Delete (replaced by TanStack Hotkeys) |
| `src/lib/hooks/use-keybindings.test.ts` | Delete (replaced by new tests) |
| `src/components/keybinding-cheat-sheet.test.tsx` | New: tests for cheat sheet |
| `src/lib/hooks/use-hotkeys.test.ts` | New: integration tests for migrated hotkeys |

---

## Task 1: Install @tanstack/react-hotkeys and set up HotkeysProvider

**Files:**
- Create: (none — package install only)
- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: Install the package**

Run: `pnpm add @tanstack/react-hotkeys`

Expected: installs `@tanstack/react-hotkeys@0.10.0` + transitive `@tanstack/hotkeys@0.8.0` + `@tanstack/react-store`.

- [ ] **Step 2: Wrap app in HotkeysProvider**

Modify `src/routes/__root.tsx` to wrap the component tree in `HotkeysProvider`:

```tsx
import type { ReactNode } from "react";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import "@/styles.css";
import { getQueryClient } from "@/lib/query";

const queryClient = getQueryClient();

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TODOIFY // TASK CONTROL" },
      { name: "description", content: "Programmer task control system" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <RootDocument>
          <Outlet />
        </RootDocument>
      </HotkeysProvider>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm run build`

Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/routes/__root.tsx
git commit -m "feat: install @tanstack/react-hotkeys and wrap app in HotkeysProvider"
```

---

## Task 2: Create KeybindingCheatSheet component

**Files:**
- Create: `src/components/keybinding-cheat-sheet.tsx`
- Create: `src/components/keybinding-cheat-sheet.test.tsx`

- [ ] **Step 1: Create the cheat sheet component**

Create `src/components/keybinding-cheat-sheet.tsx`:

```tsx
import { useHotkey, useHotkeyRegistrations } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";

interface KeybindingCheatSheetProps {
  open: boolean;
  onClose: () => void;
}

// Groups for organizing shortcuts in the cheat sheet.
// Order matters — displayed top to bottom.
const GROUPS = [
  { id: "task", label: "TASK" },
  { id: "navigation", label: "NAVIGATION" },
  { id: "view", label: "VIEW" },
  { id: "multi-select", label: "MULTI-SELECT" },
  { id: "system", label: "SYSTEM" },
] as const;

type GroupId = (typeof GROUPS)[number]["id"];

// Map hotkey strings to groups via metadata.
// This runs once per render when the sheet is open.
function groupHotkeys(
  hotkeys: ReturnType<typeof useHotkeyRegistrations>["hotkeys"],
): Map<GroupId, typeof hotkeys> {
  const grouped = new Map<GroupId, typeof hotkeys>();
  for (const g of GROUPS) grouped.set(g.id, []);
  for (const hk of hotkeys) {
    const group = (hk.meta?.group as GroupId) ?? "system";
    const arr = grouped.get(group);
    if (arr) arr.push(hk);
  }
  return grouped;
}

function formatKey(hotkey: string): string {
  return hotkey
    .replace(/Mod\+/g, "⌘/")
    .replace(/Control\+/g, "Ctrl+")
    .replace(/Meta\+/g, "⌘+");
}

export function KeybindingCheatSheet({ open, onClose }: KeybindingCheatSheetProps) {
  const { hotkeys, sequences } = useHotkeyRegistrations();

  // ? to close (works alongside Escape in the parent)
  useHotkey("Shift+?", () => {
    if (open) onClose();
  }, { ignoreInputs: false });

  if (!open) return null;

  const grouped = groupHotkeys(hotkeys);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="border border-border bg-background p-6 shadow-[0_0_40px_rgba(230,25,25,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">
            [ KEYBINDINGS ]
          </span>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground hover:text-foreground"
          >
            ESC TO CLOSE
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {GROUPS.map((group) => {
            const items = grouped.get(group.id) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  // {group.label}
                </span>
                {items.map((hk) => (
                  <div key={hk.hotkey} className="flex items-center gap-3">
                    <kbd className="min-w-[80px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                      {formatKey(hk.hotkey)}
                    </kbd>
                    <span className="font-mono text-[10px] uppercase tracking-[0.03em] text-muted-foreground">
                      {hk.meta?.name ?? hk.hotkey}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Sequences section */}
          {sequences.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                // SEQUENCES
              </span>
              {sequences.map((seq) => (
                <div key={seq.sequence.join(" ")} className="flex items-center gap-3">
                  <kbd className="min-w-[80px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent">
                    {seq.sequence.join(" → ")}
                  </kbd>
                  <span className="font-mono text-[10px] uppercase tracking-[0.03em] text-muted-foreground">
                    {seq.meta?.name ?? seq.sequence.join(" ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 border-t border-border pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground/60">
            {hotkeys.length} shortcuts · {sequences.length} sequences
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write tests for the cheat sheet**

Create `src/components/keybinding-cheat-sheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { KeybindingCheatSheet } from "./keybinding-cheat-sheet";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

describe("KeybindingCheatSheet", () => {
  it("renders nothing when closed", () => {
    render(<KeybindingCheatSheet open={false} onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.queryByText("[ KEYBINDINGS ]")).toBeNull();
  });

  it("renders the cheat sheet when open", () => {
    render(<KeybindingCheatSheet open={true} onClose={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText("[ KEYBINDINGS ]")).toBeTruthy();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onClose={onClose} />, { wrapper: Wrapper });
    const backdrop = screen.getByText("[ KEYBINDINGS ]").closest(".fixed")!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("does not close when clicking inside the panel", () => {
    const onClose = vi.fn();
    render(<KeybindingCheatSheet open={true} onClose={onClose} />, { wrapper: Wrapper });
    const panel = screen.getByText("[ KEYBINDINGS ]").parentElement!;
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Add @testing-library/react dev dependency**

Run: `pnpm add -D @testing-library/react`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test`

Expected: all existing tests pass + new cheat sheet tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/keybinding-cheat-sheet.tsx src/components/keybinding-cheat-sheet.test.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): add KeybindingCheatSheet component with useHotkeyRegistrations"
```

---

## Task 3: Migrate existing keybindings from custom hook to TanStack Hotkeys

**Files:**
- Modify: `src/routes/app/activity.tsx`
- Delete: `src/lib/hooks/use-keybindings.ts`
- Delete: `src/lib/hooks/use-keybindings.test.ts`

- [ ] **Step 1: Rewrite activity.tsx to use useHotkey**

Replace the `useKeybindings` call with individual `useHotkey` calls. Each hotkey gets `meta: { name, description }` for cheat sheet introspection.

```tsx
import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useHotkey } from "@tanstack/react-hotkeys";
import { taskListQuerySchema, type TaskListQuery } from "@/lib/schemas/task";
import { useTasks } from "@/lib/hooks/use-tasks";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { TaskStatHeader } from "@/components/task-stat-header";
import { TaskFilterBar } from "@/components/task-filter-bar";
import { TaskList } from "@/components/task-list";
import { TaskPagination } from "@/components/task-pagination";
import { KeybindingCheatSheet } from "@/components/keybinding-cheat-sheet";

export const Route = createFileRoute("/app/activity")({
  validateSearch: (input: Record<string, unknown>): TaskListQuery => {
    const parsed = taskListQuerySchema.safeParse(input);
    return parsed.success ? parsed.data : { page: 1, pageSize: 50, sort: "priority" };
  },
  component: ActivityPage,
});

function ActivityPage() {
  const search = Route.useSearch() as TaskListQuery;
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useTasks(search);

  function moveCursor(delta: number) {
    if (!data?.items.length) return;
    const idx = cursorId ? data.items.findIndex((t) => t.id === cursorId) : -1;
    const next = Math.max(0, Math.min(data.items.length - 1, idx + delta));
    setCursorId(data.items[next].id);
  }

  // --- Hotkeys (Phase 1: active) ---

  useHotkey("c", () => quickAddRef.current?.focus(), {
    meta: { name: "Create task", description: "Opens quick-add input", group: "task" },
  });

  useHotkey("/", () => searchRef.current?.focus(), {
    meta: { name: "Search", description: "Focus search bar", group: "navigation" },
  });

  useHotkey("j", () => moveCursor(1), {
    meta: { name: "Next task", description: "Move cursor down", group: "navigation" },
  });

  useHotkey("k", () => moveCursor(-1), {
    meta: { name: "Previous task", description: "Move cursor up", group: "navigation" },
  });

  useHotkey("Escape", () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
    else setCursorId(null);
  }, {
    ignoreInputs: false,
    meta: { name: "Close / Clear", description: "Close modal or clear selection", group: "system" },
  });

  useHotkey("Shift+?", () => setCheatSheetOpen((o) => !o), {
    ignoreInputs: false,
    meta: { name: "Help", description: "Show keybinding cheat sheet", group: "system" },
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
      <KeybindingCheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old hook and its test**

Run:
```bash
rm src/lib/hooks/use-keybindings.ts src/lib/hooks/use-keybindings.test.ts
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm run build`

- [ ] **Step 4: Run tests**

Run: `pnpm run test`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate activity page from custom useKeybindings to TanStack Hotkeys"
```

---

## Task 4: Register remaining keybindings with metadata (Phase 2-4 stubs)

**Files:**
- Modify: `src/routes/app.tsx`

The remaining DESIGN.md keybindings (`h`/`l`, `Enter`, `e`, `1`-`4`, `Shift+0`-`Shift+4`, `x`, `d`, `g then p/a/i/t`) are Phase 2-4 features. Register them in the app layout so they appear in the cheat sheet. Use `enabled: false` for now — they'll be enabled as features ship.

- [ ] **Step 1: Add sequence and placeholder hotkeys to app.tsx**

Modify `src/routes/app.tsx` to import `useHotkey` and `useHotkeySequence` and register all remaining shortcuts. Add the following imports and hook calls (see full file in commit):

```tsx
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
```

Register these hotkeys inside the `AppLayout` component (after the existing `useGSAP` call):

```tsx
  // --- Phase 2-4 keybindings (stubs — enabled: false until features ship) ---

  // Kanban column navigation (Phase 2)
  useHotkey("h", () => {}, {
    enabled: false,
    meta: { name: "Column left", description: "Move focus left across board columns", group: "navigation" },
  });
  useHotkey("l", () => {}, {
    enabled: false,
    meta: { name: "Column right", description: "Move focus right across board columns", group: "navigation" },
  });

  // Task detail (Phase 3)
  useHotkey("Enter", () => {}, {
    enabled: false,
    meta: { name: "Open task", description: "Open selected task detail", group: "task" },
  });
  useHotkey("e", () => {}, {
    enabled: false,
    meta: { name: "Edit task", description: "Edit selected task", group: "task" },
  });

  // Status shortcuts (Phase 2 — Kanban)
  useHotkey("1", () => {}, { enabled: false, meta: { name: "→ PLANNING", description: "Set status to PLANNING", group: "task" } });
  useHotkey("2", () => {}, { enabled: false, meta: { name: "→ IN_PROGRESS", description: "Set status to IN_PROGRESS", group: "task" } });
  useHotkey("3", () => {}, { enabled: false, meta: { name: "→ COMPLETED", description: "Set status to COMPLETED", group: "task" } });
  useHotkey("4", () => {}, { enabled: false, meta: { name: "→ DROPPED", description: "Set status to DROPPED", group: "task" } });

  // Priority shortcuts (Phase 4) — Shift+0-4 produce )!@#$ on US keyboards
  useHotkey({ key: ")", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P0", description: "Set priority to P0 (critical)", group: "task" } });
  useHotkey({ key: "!", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P1", description: "Set priority to P1", group: "task" } });
  useHotkey({ key: "@", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P2", description: "Set priority to P2", group: "task" } });
  useHotkey({ key: "#", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P3", description: "Set priority to P3", group: "task" } });
  useHotkey({ key: "$", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P4", description: "Set priority to P4 (trivial)", group: "task" } });

  // Multi-select (Phase 4)
  useHotkey("x", () => {}, {
    enabled: false,
    meta: { name: "Toggle select", description: "Toggle multi-select on cursor row", group: "multi-select" },
  });

  // Trash (Phase 3)
  useHotkey("d", () => {}, {
    enabled: false,
    meta: { name: "Trash task", description: "Move selected task to trash", group: "task" },
  });

  // Go-to sequences (Phase 2+)
  useHotkeySequence(["g", "p"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to project", description: "Open project switcher", group: "navigation" },
  });
  useHotkeySequence(["g", "a"], () => navigate({ to: "/app/activity" }), {
    timeout: 1000,
    meta: { name: "Go to activity", description: "Navigate to unified activity view", group: "navigation" },
  });
  useHotkeySequence(["g", "i"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to inbox", description: "Navigate to unassigned tasks", group: "navigation" },
  });
  useHotkeySequence(["g", "t"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to trash", description: "Navigate to trash page", group: "navigation" },
  });
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm run build`

- [ ] **Step 3: Run tests**

Run: `pnpm run test`

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.tsx
git commit -m "feat: register all DESIGN.md keybindings with metadata for cheat sheet"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full build + typecheck**

Run: `pnpm run build`

Expected: `vite build && tsc --noEmit` both pass.

- [ ] **Step 2: Full test suite**

Run: `pnpm run test`

Expected: all tests pass (cheat sheet tests + existing tests).

- [ ] **Step 3: Manual smoke test checklist**

Run: `pnpm run dev`

Then verify in browser:
1. Press `?` — cheat sheet opens with all shortcuts grouped by category
2. Press `Escape` — cheat sheet closes
3. Press `c` — quick-add input focuses
4. Press `/` — search input focuses
5. Press `j`/`k` — cursor moves down/up in task list
6. Press `?` while search input is focused — cheat sheet still opens (ignoreInputs: false)
7. Press `Escape` while search input is focused — input blurs
8. Verify `g then a` navigates to activity view (the one wired sequence)
9. Verify cheat sheet shows sequences section with g→a visible

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final polish for TanStack Hotkeys migration"
```
