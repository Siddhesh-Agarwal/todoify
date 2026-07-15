import { useRef } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { gsap, useGSAP } from "@/lib/gsap";
import { getSession } from "@/server/session";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: AppPage,
});

function AppPage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline();
    tl.from(".dash-frame", { opacity: 0, scaleX: 0, duration: 0.5, ease: "power3.out" })
      .from(".dash-readout", { opacity: 0, y: 10, duration: 0.3, stagger: 0.05, ease: "power2.out" }, "-=0.15")
      .from(".dash-section", { opacity: 0, y: 16, duration: 0.4, stagger: 0.1, ease: "power2.out" }, "-=0.1");
  }, { scope: container });

  async function logout() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <main className="relative flex min-h-svh w-full max-w-full flex-col overflow-x-hidden">
      <div ref={container} className="flex min-h-svh flex-col">
        {/* Top frame — nav bar */}
        <div className="dash-frame flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">
              [ TODOIFY ]
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              TASK CONTROL / OPERATOR DASHBOARD
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="dash-readout font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              OPERATOR: {session?.user?.email}
            </span>
            <Button variant="outline" size="xs" onClick={logout}>
              DISCONNECT
            </Button>
          </div>
        </div>

        {/* System readouts strip */}
        <div className="dash-frame grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-4">
          <Readout label="STATUS" value="OPERATIONAL" />
          <Readout label="TASKS" value="0000" />
          <Readout label="IN PROGRESS" value="0000" />
          <Readout label="OVERDUE" value="0000" />
        </div>

        {/* Main content area */}
        <div className="flex flex-1 flex-col gap-px bg-border">
          {/* Left rail + content split */}
          <div className="grid flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[200px_1fr]">
            {/* Side rail */}
            <aside className="dash-section hidden flex-col gap-4 bg-background p-4 lg:flex">
              <RailSection title="VIEWS">
                <RailItem label="ALL TASKS" active />
                <RailItem label="KANBAN" />
                <RailItem label="LIST" />
                <RailItem label="TRASH" />
              </RailSection>

              <RailSection title="PROJECTS">
                <RailItem label="NONE ASSIGNED" muted />
              </RailSection>

              <RailSection title="TAGS">
                <RailItem label="NONE ASSIGNED" muted />
              </RailSection>
            </aside>

            {/* Content — task feed placeholder */}
            <section className="dash-section flex flex-col bg-background">
              {/* Content header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-baseline gap-3">
                  <h2 className="font-macro text-2xl">ALL TASKS</h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    UNIFIED ACTIVITY FEED
                  </span>
                </div>
                <Button size="sm">
                  + QUICK ADD
                </Button>
              </div>

              {/* Empty state */}
              <div className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                  + + + NO TASK DATA + + +
                </div>
                <div className="max-w-md text-center font-mono text-xs leading-relaxed tracking-[0.03em] text-muted-foreground">
                  Task database is empty. Use QUICK ADD to create your first task. Press C to activate quick-add input. Press ? for keybinding reference.
                </div>
                <div className="flex gap-3">
                  <Button size="sm">CREATE TASK</Button>
                  <Button variant="outline" size="sm">KEYBINDINGS [?]</Button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Bottom frame — status bar */}
        <div className="dash-frame flex items-center justify-between border-t border-border px-6 py-2">
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>D1 // ONLINE</span>
            <span>FTS5 // ACTIVE</span>
            <span>SESSION // ACTIVE</span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            TODOIFY (R) / REV 2.6
          </span>
        </div>
      </div>
    </main>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="dash-readout flex flex-col gap-1 bg-background px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm font-medium uppercase tracking-[0.05em] text-foreground">
        {value}
      </span>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        // {title}
      </span>
      {children}
    </div>
  );
}

function RailItem({ label, active, muted }: { label: string; active?: boolean; muted?: boolean }) {
  return (
    <div
      className={[
        "border-l-2 px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors",
        active
          ? "border-accent text-foreground"
          : muted
          ? "border-transparent text-muted-foreground/60"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </div>
  );
}
