import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useProjects, useTags } from "@/lib/hooks/use-tasks";
import type { TaskListQuery } from "@/lib/schemas/task";

export function AppSidebar() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as TaskListQuery;
  const { data: projects } = useProjects();
  const { data: tags } = useTags();

  function setFacet(patch: Partial<TaskListQuery>) {
    navigate({ to: "/app/activity", search: (prev) => ({ ...prev, ...patch, page: 1 }) as TaskListQuery });
  }

  return (
    <aside className="dash-section hidden flex-col gap-4 bg-background p-4 lg:flex">
      <RailSection title="VIEWS">
        <RailLink label="ACTIVITY" active={true} onClick={() => navigate({ to: "/app/activity", search: (prev) => prev as TaskListQuery })} />
        <RailLink label="KANBAN" pending />
        <RailLink label="LIST" pending />
        <RailLink label="TRASH" pending />
      </RailSection>

      <RailSection title="PROJECTS">
        {projects && projects.length > 0 ? (
          projects.map((p) => (
            <RailLink
              key={p.id}
              label={p.name.toUpperCase()}
              active={search.project_id === p.id}
              onClick={() =>
                setFacet(
                  search.project_id === p.id ? { project_id: undefined } : { project_id: p.id },
                )
              }
            />
          ))
        ) : (
          <RailMuted label="NONE ASSIGNED" />
        )}
      </RailSection>

      <RailSection title="TAGS">
        {tags && tags.length > 0 ? (
          tags.map((t) => (
            <RailLink
              key={t.id}
              label={t.name.toUpperCase()}
              active={Array.isArray(search.tag_id)
                ? search.tag_id.includes(t.id)
                : search.tag_id === t.id}
              onClick={() =>
                setFacet(
                  (Array.isArray(search.tag_id) ? search.tag_id.includes(t.id) : search.tag_id === t.id)
                    ? { tag_id: undefined }
                    : { tag_id: t.id },
                )
              }
            />
          ))
        ) : (
          <RailMuted label="NONE ASSIGNED" />
        )}
      </RailSection>
    </aside>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">// {title}</span>
      {children}
    </div>
  );
}

function RailLink({
  label,
  active,
  pending,
  onClick,
}: {
  label: string;
  active?: boolean;
  pending?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={cn(
        "border-l-2 px-2 py-1.5 text-left font-mono text-[11px] uppercase tracking-[0.05em] transition-colors disabled:cursor-not-allowed",
        active
          ? "border-accent text-foreground"
          : pending
          ? "border-transparent text-muted-foreground/40"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      )}
    >
      {label}
      {pending ? " ·" : ""}
    </button>
  );
}

function RailMuted({ label }: { label: string }) {
  return <div className="border-l-2 border-transparent px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground/60">{label}</div>;
}
