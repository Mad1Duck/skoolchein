import type { ApplicationStatus, ScholarStatus, MilestoneStatus, DisputeStatus } from "@/lib/api/types";
import { TONE_BY_STATUS, type DisplayStatus } from "@/lib/programStatus";
import { useT } from "@/lib/i18n";
import { statusLabel } from "@/lib/i18n/status";

type StatusType = DisplayStatus | ApplicationStatus | ScholarStatus | MilestoneStatus | DisputeStatus;

const configMap: Record<string, { bg: string; text: string; label?: string }> = {
  // Program (ACTIVE and COMPLETED also describe scholars and milestones)
  CREATED:           { bg: TONE_BY_STATUS.CREATED,          text: "text-black" },
  APPLICATION_OPEN:  { bg: TONE_BY_STATUS.APPLICATION_OPEN, text: "text-black", label: "Open" },
  SCREENING:         { bg: TONE_BY_STATUS.SCREENING,        text: "text-black" },
  VOTING:            { bg: TONE_BY_STATUS.VOTING,           text: "text-black" },
  ACTIVE:            { bg: TONE_BY_STATUS.ACTIVE,           text: "text-black" },
  COMPLETED:         { bg: TONE_BY_STATUS.COMPLETED,        text: "text-black" },
  CANCELLED:         { bg: TONE_BY_STATUS.CANCELLED,        text: "text-black" },
  EXPIRED:           { bg: TONE_BY_STATUS.EXPIRED,          text: "text-black" },
  // Applicant
  PENDING_REVIEW:    { bg: "bg-skyellow-light",   text: "text-yellow-800", label: "Pending" },
  SHORTLISTED:       { bg: "bg-skgreen-dark",     text: "text-black" },
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
  const { t } = useT();
  const label = statusLabel(t, status);

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full border-2 border-black text-[10px] font-extrabold uppercase tracking-widest leading-none ${config.bg} ${config.text} ${className}`}>
      {label}
    </span>
  );
}
