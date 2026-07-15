import { useRef } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { gsap, useGSAP } from "@/lib/gsap";
import { getSession } from "@/server/session";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (session) throw redirect({ to: "/app" });
  },
  component: LandingPage,
});

function LandingPage() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline();
    tl.from(".land-nav", { opacity: 0, y: -12, duration: 0.5, ease: "power3.out" })
      .from(".land-hero", { opacity: 0, y: 20, duration: 0.6, stagger: 0.08, ease: "power3.out" }, "-=0.2")
      .from(".land-stat", { opacity: 0, y: 10, duration: 0.35, stagger: 0.06, ease: "power2.out" }, "-=0.2")
      .from(".land-feature", { opacity: 0, y: 16, duration: 0.4, stagger: 0.1, ease: "power2.out" }, "-=0.1")
      .from(".land-cta", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out" }, "-=0.1")
      .from(".land-foot", { opacity: 0, duration: 0.4, ease: "power2.out" }, "-=0.1");
  }, { scope: container });

  return (
    <main className="relative flex min-h-svh w-full max-w-full flex-col overflow-x-hidden">
      <div ref={container} className="flex min-h-svh flex-col">
        {/* Nav bar */}
        <nav className="land-nav flex items-center justify-between border-b border-border px-6 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground">
            [ TODOIFY ]
          </span>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" size="xs">LOGIN</Button>
            </Link>
            <Link to="/signup">
              <Button size="xs">REGISTER</Button>
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <section className="flex flex-col items-center justify-center gap-8 px-6 py-32 md:py-48">
          <div className="land-hero font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            + + + PROGRAMMER TASK CONTROL SYSTEM + + +
          </div>
          <h1 className="land-hero font-macro max-w-5xl text-center text-[clamp(3rem,8vw,7rem)]">
            TASK<br />CONTROL
          </h1>
          <p className="land-hero max-w-xl text-center font-mono text-xs leading-relaxed tracking-[0.03em] text-muted-foreground">
            A keyboard-driven task tracker for developers. Quick-add shorthand syntax, full-text search, kanban workflows, and bulk operations. Built for speed. No mouse required.
          </p>
          <div className="land-hero flex gap-3">
            <Link to="/signup">
              <Button size="lg">INITIALIZE OPERATOR</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">ACCESS TERMINAL</Button>
            </Link>
          </div>
        </section>

        {/* Stats strip */}
        <section className="grid grid-cols-2 gap-px border-y border-border bg-border md:grid-cols-4">
          <Stat label="PRIORITY LEVELS" value="P0 / P4" />
          <Stat label="STATUSES" value="4 / LIFECYCLE" />
          <Stat label="KEYBINDINGS" value="FULLY OPERABLE" />
          <Stat label="SEARCH" value="FTS5 / INDEXED" />
        </section>

        {/* Features */}
        <section className="flex flex-col gap-px bg-border">
          <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-3">
            <Feature
              title="QUICK ADD"
              body="Shorthand parsing: #project @tags P0 due:+3. Type a single string, get a structured task. Projects and tags auto-created on the fly."
            />
            <Feature
              title="FULL-TEXT SEARCH"
              body="FTS5 virtual table with sync triggers. Search across task titles and descriptions. Combine with status, priority, tag, and due-date filters."
            />
            <Feature
              title="KEYBOARD FIRST"
              body="Vim-style j/k navigation, 1-4 status changes, Shift+0-4 priority, x for multi-select, g+nav for routing. Press ? for the cheat sheet."
            />
          </div>
          <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
            <Feature
              title="BULK OPERATIONS"
              body="Multi-select with x, then batch-change status, trash, or add/remove tags. All multi-row writes run in atomic D1 batches."
              wide
            />
            <Feature
              title="SOFT DELETE / TRASH"
              body="No permanent deletion. Trashed tasks live in a dedicated view, restorable to their original project and status. Nothing is lost."
              wide
            />
          </div>
        </section>

        {/* CTA */}
        <section className="flex flex-col items-center justify-center gap-8 border-t border-border px-6 py-32 md:py-48">
          <h2 className="land-cta font-macro max-w-3xl text-center text-[clamp(2rem,5vw,4rem)]">
            READY TO<br />OPERATE?
          </h2>
          <p className="land-cta max-w-md text-center font-mono text-xs leading-relaxed tracking-[0.03em] text-muted-foreground">
            Register an operator profile and start tracking tasks in under a minute. No credit card. No team features. Just you and your work.
          </p>
          <Link to="/signup" className="land-cta">
            <Button variant="destructive" size="lg">EXECUTE REGISTRATION</Button>
          </Link>
        </section>

        {/* Footer */}
        <footer className="land-foot flex items-center justify-between border-t border-border px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            TODOIFY (R) / REV 2.6 / UNIT D-01
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            CLOUDFLARE D1 / DRIZZLE / TANSTACK
          </span>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="land-stat flex flex-col gap-1 bg-background px-4 py-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-sm font-medium uppercase tracking-[0.05em] text-foreground">
        {value}
      </span>
    </div>
  );
}

function Feature({ title, body, wide }: { title: string; body: string; wide?: boolean }) {
  return (
    <div className="land-feature flex flex-col gap-3 bg-background p-8">
      <div className="flex items-center gap-2">
        <span className="text-accent">+</span>
        <h3 className="font-mono text-sm font-medium uppercase tracking-[0.08em] text-foreground">
          {title}
        </h3>
      </div>
      <p className="max-w-md font-mono text-xs leading-relaxed tracking-[0.03em] text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
