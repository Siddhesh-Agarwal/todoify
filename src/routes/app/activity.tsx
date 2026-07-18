import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
