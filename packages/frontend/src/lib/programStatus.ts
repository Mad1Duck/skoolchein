import type { Program, ProgramStatus } from "@/lib/api/types";
import { toDate } from "@/lib/time";

/** One colour per status, shared by the program tabs and the card badge so they always match. */
export const STATUS_TONE = {
  active: "bg-skpurple",
  screening: "bg-skyellow",
  vote: "bg-skorange",
  soon: "bg-skcyan",
  running: "bg-skgreen-dark",
  done: "bg-skviolet",
  cancelled: "bg-skred",
  unapplied: "bg-gray-300",
} as const;

/** The same colour, looked up by status. */
export const TONE_BY_STATUS: Record<DisplayStatus, string> = {
  CREATED: STATUS_TONE.soon,
  APPLICATION_OPEN: STATUS_TONE.active,
  SCREENING: STATUS_TONE.screening,
  VOTING: STATUS_TONE.vote,
  ACTIVE: STATUS_TONE.running,
  COMPLETED: STATUS_TONE.done,
  CANCELLED: STATUS_TONE.cancelled,
  EXPIRED: STATUS_TONE.unapplied,
};

/**
 * The status to SHOW for a program.
 *
 * Stages open by the clock, and the contract opens the application window the first time someone
 * applies or donates, so a program can still be stored as CREATED while its window is already
 * running. Lists and buttons should treat that as open instead of "coming soon".
 */
export function effectiveStatus(p: Pick<Program, "status" | "applicationStart" | "applicationEnd">): ProgramStatus {
  if (p.status !== "CREATED" && p.status !== "APPLICATION_OPEN") return p.status;
  const start = toDate(p.applicationStart)?.getTime();
  const end = toDate(p.applicationEnd)?.getTime();
  const now = Date.now();
  // Applications are closed by the clock whether or not anyone has finalized the shortlist yet.
  if (p.status === "APPLICATION_OPEN") return end !== undefined && now >= end ? "SCREENING" : p.status;
  return start !== undefined && end !== undefined && now >= start && now < end ? "APPLICATION_OPEN" : p.status;
}

/** What a program is shown as: its status, or EXPIRED when applications closed with nobody applying. */
export type DisplayStatus = ProgramStatus | "EXPIRED";

type Unfilled = Pick<Program, "status" | "applicationStart" | "applicationEnd" | "applicantCount">;

/**
 * EXPIRED is not a contract status. Such a program accepts no more applications or donations, but it
 * is not cancelled either: the fund stays in the contract until the creator extends or cancels it.
 */
export function displayStatus(p: Unfilled): DisplayStatus {
  const end = toDate(p.applicationEnd)?.getTime();
  const expired =
    p.applicantCount === 0 &&
    ["CREATED", "APPLICATION_OPEN", "SCREENING"].includes(p.status) &&
    end !== undefined && Date.now() >= end;
  return expired ? "EXPIRED" : effectiveStatus(p);
}

/** Contract limits on extending the application deadline. */
export const MAX_EXTENSIONS = 2;
const MAX_EXTENSION_MS = 30 * 86_400_000;

/**
 * The latest new application deadline (epoch ms) that would reopen an expired program, or null when
 * the contract's limits no longer allow it. The number of extensions already used is on chain only.
 */
export function reopenLimit(p: Pick<Program, "status" | "applicationEnd" | "votingStart">): number | null {
  // Extending does not move a program back out of screening.
  if (p.status !== "CREATED" && p.status !== "APPLICATION_OPEN") return null;
  const end = toDate(p.applicationEnd)?.getTime();
  const voting = toDate(p.votingStart)?.getTime();
  if (end === undefined || voting === undefined) return null;
  // The new deadline must come before voting starts.
  const limit = Math.min(end + MAX_EXTENSION_MS, voting - 60_000);
  // Leave time to sign the transaction and for someone to apply.
  return limit > Date.now() + 10 * 60_000 ? limit : null;
}
