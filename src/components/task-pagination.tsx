import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { TaskListQuery } from "@/lib/schemas/task";

export function TaskPagination({ total, page, pageSize, search }: { total: number; page: number; pageSize: number; search: TaskListQuery }) {
  const navigate = useNavigate();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  function go(p: number) {
    navigate({ to: "/app/activity", search: (prev) => ({ ...prev, page: p }) as TaskListQuery });
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
