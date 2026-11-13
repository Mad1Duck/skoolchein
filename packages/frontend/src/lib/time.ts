/**
 * The indexer API returns timestamps as ISO strings ("2026-11-19T11:29:59.000Z"), while contract
 * reads give epoch seconds. These accept either, so a caller never has to know which it was handed
 * (Number() on an ISO string is NaN, which silently turns every deadline into "none").
 */
export function toDate(value: string | number | bigint | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  // Plain numbers: seconds, unless already milliseconds (> 10^11).
  const date = Number.isFinite(asNumber)
    ? new Date(asNumber > 100_000_000_000 ? asNumber : asNumber * 1000)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Value for <input type="datetime-local">, in the viewer's LOCAL time ("2026-11-19T18:29").
 * toISOString() gives UTC instead, so the field showed a time hours off from the real deadline
 * and a resubmitted value silently moved the date.
 */
export function toLocalInput(value: string | number | bigint | Date | null | undefined): string {
  const d = value instanceof Date ? value : toDate(value);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Epoch seconds, or null when the value is empty or unparseable. */
export function toEpochSec(value: string | number | bigint | null | undefined): number | null {
  const d = toDate(value);
  return d ? Math.floor(d.getTime() / 1000) : null;
}
