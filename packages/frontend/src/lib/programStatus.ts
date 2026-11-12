import type { Program, ProgramStatus } from "@/lib/api/types";
import { toDate } from "@/lib/time";

/**
 * The status to SHOW for a program.
 *
 * Stages open by the clock, and the contract opens the application window the first time someone
 * applies or donates, so a program can still be stored as CREATED while its window is already
 * running. Lists and buttons should treat that as open instead of "coming soon".
 */
export function effectiveStatus(p: Pick<Program, "status" | "applicationStart" | "applicationEnd">): ProgramStatus {
  if (p.status !== "CREATED") return p.status;
  const start = toDate(p.applicationStart)?.getTime();
  const end = toDate(p.applicationEnd)?.getTime();
  const now = Date.now();
  return start !== undefined && end !== undefined && now >= start && now < end ? "APPLICATION_OPEN" : p.status;
}
