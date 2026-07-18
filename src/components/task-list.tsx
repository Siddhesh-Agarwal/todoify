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
    navigate({ to: "/app/activity", search: (prev) => ({ ...prev, sort }) as TaskListQuery });
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
