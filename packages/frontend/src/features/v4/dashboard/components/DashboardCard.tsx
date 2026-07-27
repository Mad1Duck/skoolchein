import type { ComponentProps } from "react";

export function DashboardCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={`p-4 bg-white rounded-2xl border-4 border-black relative isolate before:absolute before:inset-0 before:bg-white before:rounded-2xl before:-z-10 after:absolute after:inset-0 after:bg-black after:-z-20 after:rounded-2xl after:translate-x-1 after:translate-y-1 ${className ?? ""}`}
    />
  );
}
