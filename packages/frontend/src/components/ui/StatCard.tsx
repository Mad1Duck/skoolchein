import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: "purple" | "red" | "yellow" | "green" | "cyan" | "orange";
  subtitle?: string;
}

const colorMap = {
  purple: "bg-skpurple-light text-skpurple",
  red:    "bg-skred-light text-skred",
  yellow: "bg-skyellow-light text-yellow-700",
  green:  "bg-skgreen text-green-800",
  cyan:   "bg-skcyan-light text-cyan-800",
  orange: "bg-orange-100 text-orange-700",
};

export function StatCard({ label, value, icon, color = "purple", subtitle }: StatCardProps) {
  return (
    <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-4 flex items-start gap-3">
      {icon && (
        <div className={`w-10 h-10 rounded-md ${colorMap[color]} flex items-center justify-center text-lg border-2 border-black shadow-[2px_2px_0_0_#000] shrink-0`}>
          {icon}
        </div>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-xl font-data font-bold truncate">{value}</span>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
    </div>
  );
}
