import { useT } from "@/lib/i18n";

type StatusType = "active" | "vote" | "soon" | "done" | "pddikti" | "disbursed";

interface StatusBadgeProps {
  status?: string;
  size?: "small" | "large";
}

const STATUS_STYLES = {
  active: { bg: "bg-black", label: "badge.active" },
  pddikti: { bg: "bg-black", label: "badge.pddikti" },
  vote: { bg: "bg-skred", label: "badge.vote" },
  soon: { bg: "bg-skgreen", label: "badge.soon" },
  done: { bg: "bg-skgreen", label: "badge.done" },
  disbursed: { bg: "bg-skgreen", label: "badge.disbursed" },
} as const;

export const StatusBadge = ({
  status = "active",
  size = "large",
}: StatusBadgeProps) => {
  const { t } = useT();
  const key = status.toLowerCase() as StatusType;
  const style = STATUS_STYLES[key];

  const sizeClasses =
    size === "small" ? "px-2 py-1 text-[0.625rem]" : "px-4 py-2 text-sm";

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
      className={`flex rounded-2xl ${style.bg} ${sizeClasses} justify-center items-center ${status === "active" || status === "PDDIKTI" ? "text-white" : "text-black"} font-bold`}
    >
      {t(style.label)}
    </div>
  );
};
