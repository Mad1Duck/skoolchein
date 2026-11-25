import { createFileRoute, redirect } from "@tanstack/react-router";

// Reports live on one page now (/report). The old address keeps working for saved links.
export const Route = createFileRoute("/disputes")({
  beforeLoad: () => {
    throw redirect({ to: "/report", replace: true });
  },
});
