import type { ReactNode } from "react";

interface NeoCardProps {
  children: ReactNode;
  className?: string;
  fill?: "purple" | "red" | "yellow" | "green" | "cyan" | "orange" | "pink" | "cream" | "white" | "none";
  hoverable?: boolean;
  onClick?: () => void;
}

const fillColors: Record<string, string> = {
  purple: "bg-skpurple-light",
  red:    "bg-skred-light",
  yellow: "bg-skyellow-light",
  green:  "bg-skgreen",
  cyan:   "bg-skcyan-light",
  orange: "bg-skbw",
  pink:   "bg-skpink",
  cream:  "bg-skcream",
  white:  "bg-white",
  none:   "bg-white",
};

const accentNotch: Record<string, string> = {
  purple: "text-skpurple",
  red:    "text-skred",
  yellow: "text-skyellow",
  green:  "text-skgreen",
  cyan:   "text-skcyan",
  orange: "text-skorange",
  pink:   "text-skpink",
  cream:  "text-skyellow",
  white:  "text-black",
  none:   "text-black",
};

export function NeoCard({
  children,
  className = "",
  fill = "none",
  hoverable = true,
  onClick,
}: NeoCardProps) {
  const hoverClass = hoverable
    ? "hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_#000]"
    : "";
  const cursorClass = onClick ? "cursor-pointer" : "";

  return (
    <div
      onClick={onClick}
      className={`
        relative ${fillColors[fill]} border-2 border-black rounded-lg overflow-hidden
        shadow-[3px_3px_0_0_#000]
        transition-all duration-75 ease-out
        ${hoverClass} ${cursorClass} ${className}
      `}
    >
      <div className={`neo-notch ${accentNotch[fill]} ${fill !== "none" && fill !== "white" ? "" : "hidden"}`} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Sub-component for consistent card padding */
export function NeoCardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

/** Sub-component for card section divider */
export function NeoCardSection({
  children,
  className = "",
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div className={`px-5 py-3 border-t-2 border-black ${muted ? "bg-gray-50/60" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Sub-component for card footer */
export function NeoCardFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-5 py-3.5 border-t-2 border-black bg-gray-50 ${className}`}>
      {children}
    </div>
  );
}
