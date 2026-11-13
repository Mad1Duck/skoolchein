import { useEffect, useState } from 'react';
import { toDate } from '@/lib/time';

export interface Clock {
  /** Seconds until the deadline, never negative. */
  left: number;
  ended: boolean;
  /** "02d 03h 10m 05s", or null when there is no deadline. */
  text: string | null;
  /** 0..1, how much of the window from `start` to `end` has passed (null without both dates). */
  progress: number | null;
}

/** Ticks every second toward `end`. `start` only feeds the progress value. */
export function useVotingClock(end: string | null | undefined, start?: string | null): Clock {
  const [now, setNow] = useState(() => Date.now());
  const endMs = toDate(end)?.getTime() ?? null;
  const startMs = toDate(start)?.getTime() ?? null;

  useEffect(() => {
    if (endMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endMs]);

  if (endMs === null) return { left: 0, ended: false, text: null, progress: null };

  const left = Math.max(0, Math.floor((endMs - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const progress =
    startMs !== null && endMs > startMs ? Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs))) : null;

  return { left, ended: left === 0, text: `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`, progress };
}

/** Compact, non-ticking "2d 3h" for lists. */
export function shortLeft(end: string | null | undefined): string | null {
  const endMs = toDate(end)?.getTime();
  if (endMs === undefined) return null;
  const left = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
