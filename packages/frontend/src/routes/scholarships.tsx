import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/scholarships")({
  component: () => null,
  beforeLoad: () => {
    throw redirect({ to: "/programs" });
  },
});
