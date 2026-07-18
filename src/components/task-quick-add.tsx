import { forwardRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useCreateQuickAdd } from "@/lib/hooks/use-tasks";
import type { TaskListQuery } from "@/lib/schemas/task";

export const TaskQuickAdd = forwardRef<HTMLInputElement, { search: TaskListQuery }>(
  function TaskQuickAdd({ search }, ref) {
    const [text, setText] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const mutation = useCreateQuickAdd(search);

    useEffect(() => {
      if (!warnings.length) return;
      const t = setTimeout(() => setWarnings([]), 4000);
      return () => clearTimeout(t);
    }, [warnings]);

    function submit() {
      const value = text.trim();
      if (!value) return;
      mutation.mutate(value, {
        onSuccess: ({ warnings: w }) => {
          setWarnings(w);
          setText("");
        },
        onError: () => setWarnings(["Quick-add failed — try again."]),
      });
    }

    return (
      <div className="flex flex-col gap-1 border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">+</span>
          <Input
            ref={ref}
            value={text}
            placeholder="QUICK ADD — title #project @tag P0 due:+N  (press c)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") (ref as React.RefObject<HTMLInputElement>)?.current?.blur();
            }}
            aria-invalid={mutation.isError}
          />
        </div>
        {warnings.length > 0 && (
          <div className="font-mono text-[10px] uppercase tracking-[0.05em] text-accent">
            {warnings.map((w, i) => <div key={i}>! {w}</div>)}
          </div>
        )}
      </div>
    );
  },
);
