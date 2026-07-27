type StatusType = "active" | "vote" | "soon" | "done" | "pddikti" | "disbursed";

interface StatusBadgeProps {
  status?: string;
  size?: "small" | "large";
}

const STATUS_STYLES: Record<StatusType, { bg: string; label: string }> = {
  active: { bg: "bg-black", label: "Active" },
  pddikti: { bg: "bg-black", label: "PDDIKTI Verified" },
  vote: { bg: "bg-skred", label: "On Vote" },
  soon: { bg: "bg-skgreen", label: "Soon" },
  done: { bg: "bg-skgreen", label: "Done" },
  disbursed: { bg: "bg-skgreen", label: "Disbursed" },
};

export const StatusBadge = ({
  status = "active",
  size = "large",
}: StatusBadgeProps) => {
  const key = status.toLowerCase() as StatusType;
  const style = STATUS_STYLES[key];

  const sizeClasses =
    size === "small" ? "px-2 py-1 text-[0.625rem]" : "px-4 py-2 text-sm";

  if (!style) {
    return (
      <div
        className={`flex rounded-2xl px-4 py-2 text-sm bg-gray-400 text-white font-bold justify-center items-center`}
      >
        Invalid status
      </div>
    );
  }

  return (
    <div
      className={`flex rounded-2xl ${style.bg} ${sizeClasses} justify-center items-center ${status === "active" || status === "PDDIKTI" ? "text-white" : "text-black"} font-bold`}
    >
      {style.label}
    </div>
  );
};
