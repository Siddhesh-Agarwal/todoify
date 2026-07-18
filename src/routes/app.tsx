import { useRef } from "react";
import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { gsap, useGSAP } from "@/lib/gsap";
import { getSession } from "@/server/session";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";

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
