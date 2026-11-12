import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { NeoBadge } from "@/components/ui/NeoBadge";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { CopyableText } from "@/components/ui/CopyableText";
import {
  useProgramApplicants,
  useProgramScholars,
  useProgramMilestones,
} from "@/lib/api/hooks";
import type { Program } from "@/lib/api/types";
import { fetchProgramMeta } from "@/lib/ipfs";
import { formatTokenWithSymbol, getTokenMeta } from "@/lib/contracts/v4/token";

interface Props {
  program: Program;
  onClose: () => void;
  onOverride: () => void;
}

type Section = "applicants" | "scholars" | "milestones";

const short = (a?: string | null, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : "—");
const dateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export function AdminProgramDetail({ program, onClose, onOverride }: Props) {
  const id = String(program.pid);
  const [section, setSection] = useState<Section>("applicants");

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data: meta } = useQuery({
    queryKey: ["ipfs-meta", program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  const applicantsQ = useProgramApplicants(id);
  const scholarsQ = useProgramScholars(section === "scholars" ? id : "");
  const milestonesQ = useProgramMilestones(section === "milestones" ? id : "");

  const token = program.token;
  const tokenMeta = getTokenMeta(token);
  const money = (v: string | null | undefined) => formatTokenWithSymbol(v || "0", token);

  const total = Number(program.totalFund);
  const pct = (v: string) => (total > 0 ? Math.min(100, (Number(v) / total) * 100) : 0);
  const pctSpent = pct(program.spentFund);
  const pctAllocated = Math.max(0, pct(program.allocatedFund) - pctSpent);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full overflow-y-auto bg-white border-l-2 border-black shadow-[-5px_0_0_0_#000] animate-[slide-up_0.2s_ease-out]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b-2 border-black px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-data text-sm font-black text-gray-500">#{program.pid}</span>
              <NeoBadge status={program.status} />
              <Chip className={program.openDonation ? "bg-skgreen" : "bg-gray-200"}>
                {program.openDonation ? "Donations open" : "Donations closed"}
              </Chip>
            </div>
            <h2 className="font-paytone text-2xl mt-1 [overflow-wrap:anywhere]">
              {meta?.name ?? `Program #${program.pid}`}
            </h2>
            {meta?.organization && <p className="text-sm text-gray-500 font-medium">{meta.organization}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 shrink-0 flex items-center justify-center border-2 border-black rounded-xl bg-white font-bold text-lg shadow-[2px_2px_0_0_#000] hover:bg-skred hover:text-white hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all duration-75"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {meta?.description && <p className="text-sm text-gray-700 [overflow-wrap:anywhere]">{meta.description}</p>}

          {/* Funds */}
          <Block title="Funds">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Total fund" value={money(program.totalFund)} tone="bg-skpurple-light" big />
              <Tile label="Protocol fee" value={money(program.protocolFeeCollected)} tone="bg-skyellow-light" big />
              <Tile label="Allocated" value={money(program.allocatedFund)} />
              <Tile label="Spent" value={money(program.spentFund)} />
              <Tile label="Yield accrued" value={money(program.yieldAccrued)} />
              <Tile label="Token" value={tokenMeta.isNative ? "Native (ETH)" : tokenMeta.symbol} />
            </div>
            <div className="mt-3">
              <div className="flex h-4 w-full rounded-full border-2 border-black bg-white overflow-hidden">
                <div className="h-full bg-skgreen border-r-2 border-black" style={{ width: `${pctSpent}%` }} />
                <div className="h-full bg-skyellow" style={{ width: `${pctAllocated}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500 mt-1">
                <span>Spent {pctSpent.toFixed(0)}%</span>
                <span>Pending {pctAllocated.toFixed(0)}%</span>
                <span>Free {Math.max(0, 100 - pctSpent - pctAllocated).toFixed(0)}%</span>
              </div>
            </div>
          </Block>

          {/* Participation */}
          <Block title="Participation">
            <div className="grid grid-cols-3 gap-3">
              <Tile label="Applicants" value={String(program.applicantCount)} />
              <Tile label="Shortlisted" value={String(program.shortlistedCount)} />
              <Tile label="Active scholars" value={String(program.activeScholarCount)} />
              <Tile label="Max candidates" value={String(program.maxCandidates)} />
              <Tile label="Target winners" value={String(program.targetWinners)} />
              <Tile label="Scoring" value={program.screeningMode === 0 ? "Committee" : "Student"} />
            </div>
          </Block>

          {/* Timeline */}
          <Block title="Timeline">
            <dl className="rounded-xl border-2 border-black divide-y divide-black/10 text-sm">
              <Line label="Created" value={dateTime(program.createdAt)} />
              <Line label="Application start" value={dateTime(program.applicationStart)} />
              <Line label="Application end" value={dateTime(program.applicationEnd)} />
              <Line label="Voting start" value={dateTime(program.votingStart)} />
              <Line label="Voting end" value={dateTime(program.votingEnd)} />
              <Line label="Last updated" value={dateTime(program.updatedAt)} />
            </dl>
          </Block>

          {/* On-chain */}
          <Block title="On-chain">
            <dl className="rounded-xl border-2 border-black divide-y divide-black/10 text-sm">
              <Line
                label="Initiator"
                value={
                  program.initiator ? (
                    <CopyableText
                      value={program.initiator}
                      display={short(program.initiator, 8, 6)}
                      leading={<WalletAvatar address={program.initiator} size={18} />}
                    />
                  ) : (
                    <span className="text-gray-400">Unknown</span>
                  )
                }
              />
              <Line
                label="Committee"
                value={<CopyableText value={program.committeeContract} display={short(program.committeeContract, 8, 6)} />}
              />
              <Line
                label="Token address"
                value={
                  tokenMeta.isNative ? (
                    <span className="font-data text-xs">Native</span>
                  ) : (
                    <CopyableText value={token} display={short(token, 8, 6)} />
                  )
                }
              />
              <Line
                label="Metadata CID"
                value={<CopyableText value={program.metadataCID} display={short(program.metadataCID, 10, 6)} />}
              />
            </dl>
          </Block>

          {/* Related records */}
          <Block title="Records">
            <div className="flex gap-2 mb-3">
              {(["applicants", "scholars", "milestones"] as Section[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`px-3 py-1.5 rounded-xl border-2 border-black text-xs font-bold capitalize transition-all duration-75 ${
                    section === s
                      ? "bg-black text-white shadow-none translate-x-[2px] translate-y-[2px]"
                      : "bg-white shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {section === "applicants" && (
              <RecordList loading={applicantsQ.isLoading} empty={!applicantsQ.data?.length}>
                {applicantsQ.data?.map((a) => (
                  <li key={a.wallet} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <CopyableText value={a.wallet} display={short(a.wallet)} leading={<WalletAvatar address={a.wallet} size={20} />} />

                    <span className="flex items-center gap-2">
                      <span className="font-data text-xs text-gray-500">score {a.totalScore ?? "—"}</span>
                      <NeoBadge status={a.status} />
                    </span>
                  </li>
                ))}
              </RecordList>
            )}
            {section === "scholars" && (
              <RecordList loading={scholarsQ.isLoading} empty={!scholarsQ.data?.length}>
                {scholarsQ.data?.map((s) => (
                  <li key={s.wallet} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <CopyableText value={s.wallet} display={short(s.wallet)} leading={<WalletAvatar address={s.wallet} size={20} />} />

                    <span className="flex items-center gap-2">
                      <span className="font-data text-xs text-gray-500">
                        {s.currentMilestone}/{s.totalMilestones} · {money(s.totalReceived)}
                      </span>
                      <NeoBadge status={s.status} />
                    </span>
                  </li>
                ))}
              </RecordList>
            )}
            {section === "milestones" && (
              <RecordList loading={milestonesQ.isLoading} empty={!milestonesQ.data?.length}>
                {milestonesQ.data?.map((m) => (
                  <li key={m.blockchainId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="font-data text-sm font-bold">
                      #{m.blockchainId}
                      {m.scholarWallet && (
                        <span className="ml-2">
                          <CopyableText value={m.scholarWallet} display={short(m.scholarWallet)} className="text-gray-500" />
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-data text-xs text-gray-500">{formatTokenWithSymbol(m.amount, m.token ?? token)}</span>
                      <NeoBadge status={m.status} />
                    </span>
                  </li>
                ))}
              </RecordList>
            )}
          </Block>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1 pb-4">
            <Link to="/programs/$id" params={{ id }} onClick={onClose}>
              <NeoButton label="Open public page" variant="secondary" size="md" className="!rounded-xl" />
            </Link>
            <NeoButton label="Override…" variant="danger" size="md" className="!rounded-xl" onClick={onOverride} />
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, tone = "bg-white", big = false }: { label: string; value: string; tone?: string; big?: boolean }) {
  return (
    <div className={`${tone} rounded-xl border-2 border-black p-3`}>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`${big ? "font-paytone text-xl" : "font-data text-sm font-bold"} mt-1 [overflow-wrap:anywhere]`}>{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-gray-500 text-xs font-bold uppercase tracking-wider">{label}</dt>
      <dd className="font-bold text-right">{value}</dd>
    </div>
  );
}

function Chip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 border-2 border-black rounded-full ${className}`}>
      {children}
    </span>
  );
}

function RecordList({ loading, empty, children }: { loading: boolean; empty: boolean; children: ReactNode }) {
  if (loading) return <NeoSkeleton lines={3} />;
  if (empty) {
    return <p className="rounded-xl border-2 border-dashed border-black p-6 text-center text-sm font-bold text-gray-500">No records yet.</p>;
  }
  return <ul className="rounded-xl border-2 border-black divide-y divide-black/10 max-h-72 overflow-y-auto">{children}</ul>;
}
