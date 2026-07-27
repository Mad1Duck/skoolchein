import { createContext, useContext, useState, type ReactNode } from "react";

const TabsContext = createContext<{
  current: string;
  setCurrent: (value: string) => void;
} | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components must be inside <DashboardTabs>");
  return ctx;
}

export function DashboardTabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [primitiveCurrent, setPrimitiveCurrent] = useState(defaultValue);
  const current = value === undefined ? primitiveCurrent : value;
  const setCurrent = (v: string) => {
    setPrimitiveCurrent(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ current, setCurrent }}>
      <div className={`flex flex-col ${className ?? ""}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function DashboardTabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`-mb-1 -space-x-1 z-10 flex items-end ${className ?? ""}`}>
      {children}
    </div>
  );
}

export function DashboardTabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { current, setCurrent } = useTabs();
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => setCurrent(value)}
      className={`rounded-t-2xl p-3 font-paytone border-4 border-black transition-all ${className ?? ""} ${
        active ? "bg-skbw border-b-0 h-14" : "border-b-0 h-11 opacity-80"
      }`}
    >
      {children}
    </button>
  );
}

export function DashboardTabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { current } = useTabs();
  if (current !== value) return null;
  return (
    <div
      className={`flex bg-skbw border-4 border-black rounded-b-2xl rounded-r-2xl relative p-4 grow min-h-[20rem] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
