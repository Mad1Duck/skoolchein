import { useRealtimeStatus } from "@/lib/realtime/realtime";
import { useT } from "@/lib/i18n";

const COPY = {
  live: { label: "live.live", dot: "bg-green-500 animate-pulse", hint: "live.liveHint" },
  connecting: { label: "live.connecting", dot: "bg-skyellow animate-pulse", hint: "live.connectingHint" },
  offline: { label: "live.offline", dot: "bg-skred", hint: "live.offlineHint" },
} as const;

/** Small pill showing whether the realtime feed is connected. */
export function LiveBadge({ className = "" }: { className?: string }) {
  const { t } = useT();
  const status = useRealtimeStatus();
  const { label, dot, hint } = COPY[status];
  return (
    <span
      title={t(hint)}
      className={`inline-flex items-center gap-1.5 rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${className}`}
    >
      <span className={`size-2 rounded-full ${dot}`} />
      {t(label)}
    </span>
  );
}
