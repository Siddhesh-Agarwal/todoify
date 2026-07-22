import { useRef } from "react";
import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { type TaskListQuery } from "@/lib/schemas/task";
import { gsap, useGSAP } from "@/lib/gsap";
import { getSession } from "@/server/session";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";

declare module "@tanstack/react-hotkeys" {
  interface HotkeyMeta {
    group?: string;
  }
}

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap
      .timeline()
      .from(".dash-frame", { opacity: 0, scaleX: 0, duration: 0.5, ease: "power3.out" })
      .from(".dash-section", { opacity: 0, y: 16, duration: 0.4, stagger: 0.1, ease: "power2.out" }, "-=0.1");
  }, { scope: container });

  // --- Phase 2-4 keybindings (stubs — enabled: false until features ship) ---

  // Kanban column navigation (Phase 2)
  useHotkey("H", () => {}, {
    enabled: false,
    meta: { name: "Column left", description: "Move focus left across board columns", group: "navigation" },
  });
  useHotkey("L", () => {}, {
    enabled: false,
    meta: { name: "Column right", description: "Move focus right across board columns", group: "navigation" },
  });

  // Task detail (Phase 3)
  useHotkey("Enter", () => {}, {
    enabled: false,
    meta: { name: "Open task", description: "Open selected task detail", group: "task" },
  });
  useHotkey("E", () => {}, {
    enabled: false,
    meta: { name: "Edit task", description: "Edit selected task", group: "task" },
  });

  // Status shortcuts (Phase 2 — Kanban)
  useHotkey("1", () => {}, { enabled: false, meta: { name: "→ PLANNING", description: "Set status to PLANNING", group: "task" } });
  useHotkey("2", () => {}, { enabled: false, meta: { name: "→ IN_PROGRESS", description: "Set status to IN_PROGRESS", group: "task" } });
  useHotkey("3", () => {}, { enabled: false, meta: { name: "→ COMPLETED", description: "Set status to COMPLETED", group: "task" } });
  useHotkey("4", () => {}, { enabled: false, meta: { name: "→ DROPPED", description: "Set status to DROPPED", group: "task" } });

  // Priority shortcuts (Phase 4) — Shift+0-4 produce )!@#$ on US keyboards
  useHotkey({ key: ")", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P0", description: "Set priority to P0 (critical)", group: "task" } });
  useHotkey({ key: "!", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P1", description: "Set priority to P1", group: "task" } });
  useHotkey({ key: "@", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P2", description: "Set priority to P2", group: "task" } });
  useHotkey({ key: "#", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P3", description: "Set priority to P3", group: "task" } });
  useHotkey({ key: "$", shift: true }, () => {}, { enabled: false, meta: { name: "Priority P4", description: "Set priority to P4 (trivial)", group: "task" } });

  // Multi-select (Phase 4)
  useHotkey("X", () => {}, {
    enabled: false,
    meta: { name: "Toggle select", description: "Toggle multi-select on cursor row", group: "multi-select" },
  });

  // Trash (Phase 3)
  useHotkey("D", () => {}, {
    enabled: false,
    meta: { name: "Trash task", description: "Move selected task to trash", group: "task" },
  });

  // Go-to sequences (Phase 2+)
  useHotkeySequence(["G", "P"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to project", description: "Open project switcher", group: "navigation" },
  });
  useHotkeySequence(["G", "A"], () => navigate({ to: "/app/activity", search: { page: 1, pageSize: 50, sort: "priority" } as TaskListQuery }), {
    timeout: 1000,
    meta: { name: "Go to activity", description: "Navigate to unified activity view", group: "navigation" },
  });
  useHotkeySequence(["G", "I"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to inbox", description: "Navigate to unassigned tasks", group: "navigation" },
  });
  useHotkeySequence(["G", "T"], () => {}, {
    enabled: false,
    timeout: 1000,
    meta: { name: "Go to trash", description: "Navigate to trash page", group: "navigation" },
  });

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
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">[ TODOIFY ]</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              TASK CONTROL / OPERATOR DASHBOARD
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              OPERATOR: {session?.user?.email}
            </span>
            <Button variant="outline" size="xs" onClick={logout}>DISCONNECT</Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 flex-col gap-px bg-border">
          <div className="grid flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[200px_1fr]">
            <AppSidebar />
            <section className="dash-section flex flex-col bg-background">
              <Outlet />
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
