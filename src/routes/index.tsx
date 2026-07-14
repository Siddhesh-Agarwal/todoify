import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { getSession } from "@/server/session";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    return { session };
  },
  component: HomePage,
});

function HomePage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();

  async function logout() {
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Todoify</h1>
      <p className="text-muted-foreground">
        Signed in as {session?.user?.email}
      </p>
      <Button variant="outline" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
