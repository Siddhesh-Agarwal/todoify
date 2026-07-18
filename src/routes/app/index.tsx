import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/activity", search: { page: 1, pageSize: 50, sort: "priority" } });
  },
});
