import { useRealtimeStatus } from "@/lib/realtime/realtime";

const COPY = {
  live: { label: "Live", dot: "bg-green-500 animate-pulse", hint: "Updates arrive in real time" },
  connecting: { label: "Connecting", dot: "bg-skyellow animate-pulse", hint: "Connecting to the live feed" },
  offline: { label: "Reconnecting", dot: "bg-skred", hint: "Live feed is down. Refreshing every few seconds instead." },
} as const;

/** Small pill showing whether the realtime feed is connected. */
export function LiveBadge({ className = "" }: { className?: string }) {
  const status = useRealtimeStatus();
  const { label, dot, hint } = COPY[status];
  return (
    <span
      title={hint}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${className}`}
    >
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
