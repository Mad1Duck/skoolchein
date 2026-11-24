/** The contract gives the accused scholar 7 days to answer a report (ScholarshipTypes.DEFENSE_WINDOW). */
const DEFENSE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The indexer does not store a dispute's defence deadline, so the screens never knew when it ended
 * (the "auto-guilty" button could not appear). It is always raisedAt + 7 days, so fill it in here.
 */
export function withDefenseDeadline<T extends { defenseDeadline: Date | null; raisedAt: Date | null }>(d: T): T {
  if (d.defenseDeadline || !d.raisedAt) return d;
  return { ...d, defenseDeadline: new Date(new Date(d.raisedAt).getTime() + DEFENSE_WINDOW_MS) };
}
