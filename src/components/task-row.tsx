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
