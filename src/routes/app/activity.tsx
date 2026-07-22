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

declare module "@tanstack/react-hotkeys" {
  interface HotkeyMeta {
    group?: string;
  }
}

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

  useHotkey("C", () => quickAddRef.current?.focus(), {
    meta: { name: "Create task", description: "Opens quick-add input", group: "task" },
  });

  useHotkey("/", () => searchRef.current?.focus(), {
    meta: { name: "Search", description: "Focus search bar", group: "navigation" },
  });

  useHotkey("J", () => moveCursor(1), {
    meta: { name: "Next task", description: "Move cursor down", group: "navigation" },
  });

  useHotkey("K", () => moveCursor(-1), {
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

  useHotkey({ key: "/", shift: true }, () => setCheatSheetOpen((o) => !o), {
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
