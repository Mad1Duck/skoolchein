import type { ProgramStatus, ApplicationStatus, ScholarStatus, MilestoneStatus, DisputeStatus } from "@/lib/api/types";

type StatusType = ProgramStatus | ApplicationStatus | ScholarStatus | MilestoneStatus | DisputeStatus;

const configMap: Record<string, { bg: string; text: string; label?: string }> = {
  // Program
  CREATED:           { bg: "bg-gray-200",        text: "text-gray-800" },
  APPLICATION_OPEN:  { bg: "bg-skyellow",         text: "text-black", label: "Open" },
  SCREENING:         { bg: "bg-skorange",         text: "text-black" },
  VOTING:            { bg: "bg-skpurple",         text: "text-white" },
  ACTIVE:            { bg: "bg-skgreen",          text: "text-black" },
  COMPLETED:         { bg: "bg-skpurple-light",   text: "text-skpurple" },
  CANCELLED:         { bg: "bg-skred",            text: "text-white" },
  // Applicant
  PENDING_REVIEW:    { bg: "bg-skyellow-light",   text: "text-yellow-800", label: "Pending" },
  SHORTLISTED:       { bg: "bg-skgreen",          text: "text-green-900" },
  SCREENED_OUT:      { bg: "bg-skred-light",      text: "text-red-800", label: "Rejected" },
  LOCKED:            { bg: "bg-gray-300",         text: "text-gray-700" },
  // Scholar
  FROZEN:            { bg: "bg-skcyan",           text: "text-cyan-900" },
  BLACKLISTED:       { bg: "bg-black",            text: "text-white" },
  // Milestone
  PENDING:           { bg: "bg-gray-200",         text: "text-gray-700" },
  SUBMITTED:         { bg: "bg-skyellow",         text: "text-black" },
  DISPUTED:          { bg: "bg-skred",            text: "text-white" },
  // Dispute
  STUDENT_CONCEDED:  { bg: "bg-skred-light",      text: "text-red-800", label: "Conceded" },
  AUTO_GUILTY:       { bg: "bg-skred",            text: "text-white", label: "Auto Guilty" },
  BH_WON:            { bg: "bg-skgreen",          text: "text-green-900", label: "BH Won" },
  BH_LOST:           { bg: "bg-skred-light",      text: "text-red-800", label: "BH Lost" },
};

export function NeoBadge({
  status,
  className = "",
}: {
  status: StatusType;
  className?: string;
}) {
  const config = configMap[status] ?? { bg: "bg-gray-200", text: "text-gray-800" };
  const label = config.label ?? status.replace(/_/g, " ");

  return (
    <span className={`inline-flex items-center px-2 py-0.5 border-2 border-black text-[10px] font-extrabold uppercase tracking-widest leading-none ${config.bg} ${config.text} ${className}`}>
      {label}
    </span>
  );
}
