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
    navigate({ to: "/app/activity", search: (prev) => ({ ...prev, ...patch, page: 1 }) as TaskListQuery });
  }

  const ACTIVE_STATUSES: TaskListQuery["status"] = ["PLANNING", "IN_PROGRESS"];

  const cells: { label: string; value: number; onClick: () => void }[] = [
    { label: "IN PROGRESS", value: data?.inProgress ?? 0, onClick: () => go({ status: "IN_PROGRESS" }) },
    {
      label: "OVERDUE",
      value: data?.overdue ?? 0,
      onClick: () => go({ due_before: ymd(new Date(Date.now() - 86_400_000)), due_after: undefined, status: ACTIVE_STATUSES }),
    },
    {
      label: "DUE THIS WEEK",
      value: data?.dueThisWeek ?? 0,
      onClick: () => {
        const today = new Date();
        const week = new Date(today);
        week.setUTCDate(week.getUTCDate() + 7);
        go({ due_after: ymd(today), due_before: ymd(week), status: ACTIVE_STATUSES });
      },
    },
    { label: "TOTAL ACTIVE", value: data?.totalActive ?? 0, onClick: () => go({ status: ACTIVE_STATUSES, priority: undefined, project_id: undefined, tag_id: undefined, due_after: undefined, due_before: undefined, search: undefined }) },
  ];

  return (
    <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
      {cells.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={c.onClick}
          className="flex flex-col gap-1 bg-background px-4 py-3 text-left transition-colors hover:bg-secondary"
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
