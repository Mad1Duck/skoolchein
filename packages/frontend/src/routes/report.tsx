import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/features/v4/report/pages/ReportPage";

export const Route = createFileRoute("/report")({
  component: ReportPage,
});
