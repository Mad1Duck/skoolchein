import { useT } from "@/lib/i18n";
import { STATUS_TONE } from "@/lib/programStatus";

type StatusType = keyof typeof STATUS_TONE | "pddikti" | "disbursed";

interface StatusBadgeProps {
  status?: string;
  size?: "small" | "large";
}

const STATUS_STYLES = {
  active: { bg: STATUS_TONE.active, label: "badge.active" },
  screening: { bg: STATUS_TONE.screening, label: "badge.screening" },
  vote: { bg: STATUS_TONE.vote, label: "badge.vote" },
  soon: { bg: STATUS_TONE.soon, label: "badge.soon" },
  running: { bg: STATUS_TONE.running, label: "badge.running" },
  done: { bg: STATUS_TONE.done, label: "badge.done" },
  cancelled: { bg: STATUS_TONE.cancelled, label: "badge.cancelled" },
  unapplied: { bg: STATUS_TONE.unapplied, label: "badge.unapplied" },
  pddikti: { bg: "bg-black text-white", label: "badge.pddikti" },
  disbursed: { bg: STATUS_TONE.running, label: "badge.disbursed" },
} as const;

export const StatusBadge = ({
  status = "active",
  size = "large",
}: StatusBadgeProps) => {
  const { t } = useT();
  const key = status.toLowerCase() as StatusType;
  const style = STATUS_STYLES[key];

  const sizeClasses =
    size === "small" ? "px-2.5 py-1 text-[0.625rem]" : "px-4 py-1.5 text-sm";

  if (!style) {
    return (
      <div
        className={`flex rounded-2xl px-4 py-2 text-sm bg-gray-400 text-white font-bold justify-center items-center`}
      >
        {t('badge.invalid')}
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 whitespace-nowrap rounded-full border-2 border-black shadow-[2px_2px_0_0_#000] ${style.bg} ${sizeClasses} justify-center items-center font-bold`}
    >
      {t(style.label)}
    </div>
  );
};
