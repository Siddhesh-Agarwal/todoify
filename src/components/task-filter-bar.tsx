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
