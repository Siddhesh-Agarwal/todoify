import { useRef } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { gsap, useGSAP } from "@/lib/gsap";
import { loginSchema, type LoginInput } from "@/lib/schemas/auth";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline();
    tl.from(".auth-frame", { opacity: 0, scaleX: 0, duration: 0.6, ease: "power3.out" })
      .from(".auth-line", { opacity: 0, x: -20, duration: 0.4, stagger: 0.08, ease: "power2.out" }, "-=0.2")
      .from(".auth-input", { opacity: 0, y: 12, duration: 0.35, stagger: 0.06, ease: "power2.out" }, "-=0.1")
      .from(".auth-cta", { opacity: 0, y: 12, duration: 0.4, ease: "power2.out" }, "-=0.1");
  }, { scope: container });

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: async (input: LoginInput) =>
      authClient.signIn.email({ email: input.email, password: input.password }),
  });

  async function onSubmit(input: LoginInput) {
    const { error } = await mutation.mutateAsync(input);
    if (error) {
      form.setError("password", {
        message: error.message ?? "Invalid credentials",
      });
      return;
    }
    await navigate({ to: "/app" });
  }

  return (
    <main className="relative flex min-h-svh w-full max-w-full flex-col overflow-x-hidden">
      <div ref={container} className="flex min-h-svh flex-col">
        {/* Terminal frame border */}
        <div className="auth-frame flex items-center justify-between border-b border-border px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            [ TODOIFY // TASK CONTROL ]
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            SYS / AUTH / LOGIN
          </span>
        </div>

        {/* Editorial split — terminal left, form right */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_1fr]">
          {/* Left: terminal display */}
          <div className="relative hidden flex-col justify-between border-r border-border p-12 lg:flex">
            <div className="space-y-6">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                + + + AUTHORIZATION REQUIRED + + +
              </div>
              <h1 className="auth-line font-macro max-w-md text-[clamp(2.5rem,5vw,4.5rem)]">
                ACCESS<br />TERMINAL
              </h1>
              <div className="auth-line max-w-sm font-mono text-xs leading-relaxed tracking-[0.03em] text-muted-foreground">
                Programmer task control system. Authentication required to access operational task database. All sessions are logged.
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                // SYSTEM STATUS
              </div>
              <div className="flex gap-6 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>D1 // ONLINE</span>
                <span>FTS5 // ACTIVE</span>
                <span>AUTH // READY</span>
              </div>
            </div>
          </div>

          {/* Right: auth form */}
          <div className="flex flex-col justify-center p-8 lg:p-12">
            <div className="auth-line mb-8 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              [ AUTH // CREDENTIALS ]
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="auth-input space-y-2">
                <Label htmlFor="email">EMAIL</Label>
                <Input
                  id="email"
                  autoComplete="email"
                  placeholder="user@domain.dev"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-accent">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="auth-input space-y-2">
                <Label htmlFor="password">PASSWORD</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
                {form.formState.errors.password && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-accent">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="auth-cta w-full"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "AUTHENTICATING..." : "EXECUTE LOGIN"}
              </Button>

              <div className="auth-cta flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                <span>NO ACCOUNT?</span>
                <Link to="/signup" className="text-foreground underline underline-offset-4">
                  INITIALIZE SIGNUP
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Footer frame */}
        <div className="auth-frame flex items-center justify-between border-t border-border px-6 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            REV 2.6 / UNIT D-01
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            TODOIFY (R) / SECURE
          </span>
        </div>
      </div>
    </main>
  );
}
