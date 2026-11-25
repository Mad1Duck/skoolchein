import { createFileRoute } from "@tanstack/react-router";
import { ReportHubPage } from "@/features/v4/report/pages/ReportHubPage";

// /report is the list of reports; /report?new=1 opens the "new report" flow straight away.
export const Route = createFileRoute("/report")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } =>
    search.new === true || search.new === 1 || search.new === "1" || search.new === "true" ? { new: true } : {},
  component: ReportRoute,
});

function ReportRoute() {
  const { new: isNew } = Route.useSearch();
  return <ReportHubPage key={isNew ? "new" : "list"} initialView={isNew ? "new" : "list"} />;
}
