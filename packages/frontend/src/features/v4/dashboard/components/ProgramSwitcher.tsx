import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { NeoBadge } from "@/components/ui/NeoBadge";
import type { Program } from "@/lib/api/types";
import { fetchProgramMeta } from "@/lib/ipfs";
import { useFormatMoney } from "@/lib/money";
import { NeoSelect } from "@/components/ui/NeoSelect";
import { useT } from "@/lib/i18n";
import { statusLabel } from "@/lib/i18n/status";

interface Props {
  programs: Program[];
  selectedPid: number | undefined;
  onSelect: (pid: number) => void;
}

/**
 * Single place to choose which of the creator's programs the dashboard shows.
 * The profile card and every tab below follow the selection, so there is only
 * one way to switch programs. Programs can be searched by name or #id and
 * filtered by status.
 */
export function ProgramSwitcher({ programs, selectedPid, onSelect }: Props) {
  const fmt = useFormatMoney();
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");

  // Same query key as every other place that shows a program name, so it is shared.
  const metas = useQueries({
    queries: programs.map((p) => ({
      queryKey: ["ipfs-meta", p.metadataCID],
      queryFn: () => fetchProgramMeta(p.metadataCID),
      enabled: !!p.metadataCID,
      staleTime: Infinity,
    })),
  });
  const nameOf = (i: number, p: Program) => metas[i]?.data?.name || `Program #${p.pid}`;

  const statuses = useMemo(() => Array.from(new Set(programs.map((p) => p.status))), [programs]);

  const visible = programs
    .map((p, i) => ({ p, name: nameOf(i, p) }))
    .filter(({ p, name }) => {
      if (status !== "ALL" && p.status !== status) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return name.toLowerCase().includes(q) || String(p.pid) === q.replace("#", "");
    });

  const showControls = programs.length > 1;

  return (
    <section className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#000] p-4 md:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-paytone text-xl">My Programs</h2>
          <span className="text-xs font-bold font-data text-gray-500">
            {visible.length === programs.length ? programs.length : `${visible.length} of ${programs.length}`}
          </span>
        </div>

        {showControls && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or #id"
              className="!py-1.5 !text-sm w-44 !rounded-xl"
            />
            <NeoSelect
              size="sm"
              className="w-44"
              ariaLabel="Filter by status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "ALL", label: "All status" },
                ...statuses.map((s) => ({ value: s as string, label: statusLabel(t, s) })),
              ]}
            />
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-black p-5 text-center text-sm font-bold text-gray-500">
          No programs match.
        </p>
      ) : (
        <div role="listbox" aria-label="My programs" className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {visible.map(({ p, name }) => {
            const selected = p.pid === selectedPid;
            return (
              <button
                key={p.pid}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(p.pid)}
                title={name}
                className={`shrink-0 w-56 text-left rounded-xl border-2 border-black p-3 space-y-1.5 transition-all duration-75 ${
                  selected
                    ? "bg-skpurple text-white shadow-none translate-x-[2px] translate-y-[2px]"
                    : "bg-white shadow-[3px_3px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#000]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-data text-xs font-black ${selected ? "text-white/80" : "text-gray-500"}`}>#{p.pid}</span>
                  <NeoBadge status={p.status} />
                </div>
                <p className="font-paytone text-base leading-tight truncate">{name}</p>
                <p className={`font-data text-xs font-bold ${selected ? "text-white/90" : "text-gray-600"}`}>
                  {fmt(p.totalFund, p.token)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
