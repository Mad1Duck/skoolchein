import { useMemo, useState, type ReactNode } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Navigate } from "@tanstack/react-router";
import { useAdminOverview, usePrograms, useApplicants, useScholars, type Program } from "@/lib/api";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { useActiveChain, useV4Addresses } from '@/lib/chain/useActiveChain';
import { parseAbi, formatUnits } from "viem";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoBadge } from "@/components/ui/NeoBadge";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { WalletAvatar } from "@/components/ui/WalletAvatar";
import { CopyableText, truncateMiddle } from "@/components/ui/CopyableText";
import { LiveBadge } from "@/components/ui/LiveBadge";
import { NeoSelect } from "@/components/ui/NeoSelect";
import { useT } from "@/lib/i18n";
import { statusLabel } from "@/lib/i18n/status";
import { AdminControlModal } from "../components/AdminControlModal";
import { AdminProgramDetail } from "../components/AdminProgramDetail";
import { AdminProtocolConfig } from "../components/AdminProtocolConfig";
import { AdminTokenOracle } from "../components/AdminTokenOracle";
import { formatTokenWithSymbol } from "@/lib/contracts/v4/token";

type Tab = "programs" | "users" | "treasury" | "config";

const TABS: { key: Tab; label: string }[] = [
  { key: "programs", label: "Programs" },
  { key: "users", label: "Users & Roles" },
  { key: "treasury", label: "Treasury" },
  { key: "config", label: "Config" },
];

const short = (a: string, head = 6, tail = 4) => (a ? `${a.slice(0, head)}…${a.slice(-tail)}` : "—");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "N/A");
const fmtDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "N/A";

function timeAgo(d?: string | null): string {
  if (!d) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (sec < 60) return "just now";
  const units: [number, string][] = [[86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) {
    if (sec >= size) return `${Math.floor(sec / size)}${label} ago`;
  }
  return "";
}

export function AdminDashboardPage() {
  const { t } = useT();
  const v4Addresses = useV4Addresses();
  const { chainId } = useActiveChain();
  const { address } = useAccount();
  const { data: adminAddress, isLoading: isContractLoading } = useReadContract({
    chainId,
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "admin",
  });

  const { data: overview, isLoading: isOverviewLoading } = useAdminOverview();
  const { data: programsData } = usePrograms({ limit: 100 });
  const { data: applicantsData } = useApplicants();
  const { data: scholarsData } = useScholars();

  // Treasury.
  // NOTE: this reads the Treasury's *USDC* balance specifically, so 6 decimals
  // below is correct. It does NOT include native-token programs — their funds
  // sit as the contract's ETH balance. Add a separate native balance read if
  // an all-token total is needed.
  const { data: treasuryBalance } = useReadContract({
    chainId,
    address: v4Addresses.MockUSDC,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [v4Addresses.ScholarshipTreasury],
  });

  // WARNING: Treasury.protocolFeeAccumulated is a single counter incremented
  // by slashAndDistribute regardless of the program's token, so once native
  // programs exist it sums raw 18-decimal and 6-decimal amounts together and
  // is no longer meaningful as one number. Displayed as USDC below only
  // because that's what it was pre-multi-token. Needs a per-token mapping
  // in the contract to be correct.
  const { data: protocolFee } = useReadContract({
    chainId,
    address: v4Addresses.ScholarshipTreasury,
    abi: parseAbi(["function protocolFeeAccumulated() view returns (uint256)"]),
    functionName: "protocolFeeAccumulated",
  });

  const [activeTab, setActiveTab] = useState<Tab>("programs");
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [detailProgram, setDetailProgram] = useState<Program | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState<{ key: "pid" | "created"; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });

  const toggleSort = (key: "pid" | "created") =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const programs = programsData?.data;
  const statuses = useMemo(() => Array.from(new Set((programs ?? []).map((p) => p.status))), [programs]);
  const filteredPrograms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (programs ?? []).filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!q) return true;
      return String(p.pid) === q.replace("#", "") || p.initiator.toLowerCase().includes(q);
    });
    const value = (p: Program) => (sort.key === "pid" ? p.pid : new Date(p.createdAt).getTime() || 0);
    return rows.sort((a, b) => (sort.dir === "desc" ? value(b) - value(a) : value(a) - value(b)));
  }, [programs, query, statusFilter, sort]);
  const creators = useMemo(() => Array.from(new Set((programs ?? []).map((p) => p.initiator))), [programs]);
  const revenuePrograms = useMemo(
    () =>
      (programs ?? [])
        .filter((p) => Number(p.protocolFeeCollected) > 0)
        .sort((a, b) => Number(b.protocolFeeCollected) - Number(a.protocolFeeCollected)),
    [programs],
  );

  if (isContractLoading || isOverviewLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <NeoSkeleton lines={8} />
      </div>
    );
  }

  const isAdmin = address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase();

  if (!isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="font-paytone text-3xl md:text-5xl leading-[0.95] mb-2">Protocol Admin</h1>
          <p className="text-gray-500 font-bold text-sm">Global oversight and matrix control.</p>
        </div>
        <div className="inline-flex items-center gap-2 self-start md:self-auto rounded-xl border-2 border-black bg-white px-3 py-2 shadow-[3px_3px_0_0_#000]">
          <WalletAvatar address={address as string} size={22} />
          <LiveBadge />
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">Admin</span>
          <CopyableText value={address as string} display={short(address as string)} className="!text-sm" />
        </div>
      </div>

      {/* Overview */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatTile title="Programs" value={overview.totalPrograms} color="bg-skpurple-light" />
          <StatTile title="Creators" value={overview.totalCreators} color="bg-skyellow-light" />
          <StatTile title="Applicants" value={overview.totalApplicants} color="bg-skgreen-light" />
          <StatTile title="Scholars" value={overview.totalScholars} color="bg-skpurple text-white" />
          <StatTile title="Milestones" value={overview.totalMilestones} color="bg-skorange" />
          <StatTile title="Disputes" value={overview.totalDisputes} color="bg-skred-light" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`shrink-0 px-4 py-2 rounded-xl border-2 border-black font-bold text-sm transition-all duration-75 ${
              activeTab === key
                ? "bg-black text-white shadow-none translate-x-[2px] translate-y-[2px]"
                : "bg-white text-black shadow-[3px_3px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#000]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Programs */}
      {activeTab === "programs" && (
        <Panel
          title="All Programs"
          subtitle={`${filteredPrograms.length} of ${programs?.length ?? 0}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search #id or wallet"
                className="!py-1.5 !text-sm w-48 !rounded-xl"
              />
              <NeoSelect
                size="sm"
                className="w-44"
                ariaLabel="Filter by status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "ALL", label: "All status" },
                  ...statuses.map((s) => ({ value: s as string, label: statusLabel(t, s) })),
                ]}
              />
            </div>
          }
        >
          <DataTable
            head={[
              <SortHead key="id" label="ID" active={sort.key === "pid"} dir={sort.dir} onClick={() => toggleSort("pid")} />,
              "Status",
              "Fund",
              <SortHead key="created" label="Created" active={sort.key === "created"} dir={sort.dir} onClick={() => toggleSort("created")} />,
              "Program Period",
              "Initiator",
              "",
            ]}
            empty={filteredPrograms.length === 0 ? "No programs match." : undefined}
          >
            {filteredPrograms.map((p) => (
              <tr
                key={p.pid}
                onClick={() => setDetailProgram(p)}
                className="border-b border-black/10 hover:bg-skbw/60 transition-colors cursor-pointer"
              >
                <td className="p-3 font-black font-data">#{p.pid}</td>
                <td className="p-3"><NeoBadge status={p.status} /></td>
                <td className="p-3 font-bold font-data whitespace-nowrap">{formatTokenWithSymbol(p.totalFund || "0", p.token)}</td>
                <td className="p-3 whitespace-nowrap">
                  <div className="font-data text-xs font-bold">{fmtDateTime(p.createdAt)}</div>
                  <div className="text-[11px] text-gray-500 font-medium">{timeAgo(p.createdAt)}</div>
                </td>
                <td className="p-3 text-xs font-bold text-gray-600 font-data whitespace-nowrap">
                  {fmtDate(p.applicationStart)} – {fmtDate(p.votingEnd)}
                </td>
                <td className="p-3">
                  {p.initiator ? (
                    <CopyableText
                      value={p.initiator}
                      display={short(p.initiator)}
                      leading={<WalletAvatar address={p.initiator} size={18} />}
                      className="text-skpurple"
                    />
                  ) : (
                    <span className="text-xs font-bold text-gray-400">Unknown</span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <NeoButton label="Detail" variant="primary" size="sm" onClick={() => setDetailProgram(p)} />
                    <NeoButton label="Override" variant="secondary" size="sm" onClick={() => setSelectedProgram(p)} />
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {/* Users */}
      {activeTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel title="System Creators" subtitle={`${creators.length}`} tone="bg-skyellow">
            <ListScroll>
              {creators.map((wallet) => (
                <Row key={wallet}>
                  <CopyableText
                    value={wallet}
                    display={short(wallet, 10, 8)}
                    leading={<WalletAvatar address={wallet} size={20} />}
                    className="!text-sm min-w-0"
                  />
                  <Pill className="bg-skyellow">CORE_ROLE</Pill>
                </Row>
              ))}
            </ListScroll>
          </Panel>
          <Panel title="Global Applicants" subtitle={`${applicantsData?.length ?? 0}`} tone="bg-skgreen">
            <ListScroll>
              {applicantsData?.map((a, i) => (
                <Row key={i}>
                  <CopyableText value={a.applicant.wallet} display={short(a.applicant.wallet, 8, 4)} className="!text-sm" />
                  <span className="font-data text-xs font-bold text-gray-500">#{a.program?.pid}</span>
                  <NeoBadge status={a.applicant.status} />
                </Row>
              ))}
            </ListScroll>
          </Panel>
          <Panel title="Global Scholars" subtitle={`${scholarsData?.length ?? 0}`} tone="bg-skpurple text-white">
            <ListScroll>
              {scholarsData?.map((s, i) => (
                <Row key={i}>
                  <CopyableText value={s.scholar.wallet} display={short(s.scholar.wallet, 8, 4)} className="!text-sm" />
                  <span className="font-data text-xs font-bold text-gray-500">#{s.program?.pid}</span>
                  <span className="font-data text-sm font-bold text-skpurple whitespace-nowrap">
                    {formatTokenWithSymbol(s.scholar.totalReceived || "0", s.program?.token)}
                  </span>
                </Row>
              ))}
            </ListScroll>
          </Panel>
        </div>
      )}

      {/* Treasury */}
      {activeTab === "treasury" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Treasury Overview">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border-2 border-black bg-skpurple-light p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Total Backing (USDC)</p>
                <p className="font-paytone text-3xl mt-1 break-words">
                  ${treasuryBalance !== undefined ? formatUnits(treasuryBalance as bigint, 6) : "0.0"}
                </p>
              </div>
              <div className="rounded-xl border-2 border-black bg-skyellow-light p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">Protocol Revenue</p>
                <p className="font-paytone text-3xl mt-1 break-words">
                  ${protocolFee !== undefined ? formatUnits(protocolFee as bigint, 6) : "0.0"}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Contract Registry">
            <div className="p-4 space-y-3">
              <ContractItem label="ScholarshipCore" address={v4Addresses.ScholarshipCore} />
              <ContractItem label="TreasuryVault" address={v4Addresses.ScholarshipTreasury} />
              <ContractItem label="Bounty/Dispute" address={v4Addresses.ScholarshipBounty} />
              <ContractItem label="Reputation (NFT)" address={v4Addresses.ScholarshipReputation} />
            </div>
          </Panel>

          <div className="md:col-span-2">
            <Panel title="Revenue Breakdown by Program" tone="bg-skyellow">
              <DataTable
                head={["Prog ID", "Revenue Collected", "Total Fund", "Fee Rate"]}
                alignRight={[1, 2, 3]}
                empty={revenuePrograms.length === 0 ? "No revenue collected yet." : undefined}
              >
                {revenuePrograms.map((p) => (
                  <tr key={p.pid} className="border-b border-black/10 hover:bg-skbw/60 transition-colors">
                    <td className="p-3 font-black font-data">#{p.pid}</td>
                    <td className="p-3 text-right font-data font-bold text-skpurple">{formatTokenWithSymbol(p.protocolFeeCollected, p.token)}</td>
                    <td className="p-3 text-right text-xs text-gray-600 font-data">{formatTokenWithSymbol(p.totalFund, p.token)}</td>
                    <td className="p-3 text-right">
                      <Pill className="bg-skyellow">
                        {((Number(p.protocolFeeCollected) / Number(p.totalFund)) * 100).toFixed(2)}%
                      </Pill>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </div>
        </div>
      )}

      {/* Config */}
      {activeTab === "config" && (
        <div className="space-y-8">
          <AdminProtocolConfig />
          <AdminTokenOracle />
        </div>
      )}

      {detailProgram && (
        <AdminProgramDetail
          program={detailProgram}
          onClose={() => setDetailProgram(null)}
          onOverride={() => {
            setSelectedProgram(detailProgram);
            setDetailProgram(null);
          }}
        />
      )}

      {selectedProgram && (
        <AdminControlModal
          program={selectedProgram}
          isOpen={true}
          onClose={() => setSelectedProgram(null)}
        />
      )}
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────────── */

function StatTile({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className={`${color} border-2 border-black rounded-xl p-4 shadow-[3px_3px_0_0_#000]`}>
      <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">{title}</div>
      <div className="font-paytone text-3xl mt-1 leading-none">{value}</div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  tone = "bg-white",
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  tone?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-white border-2 border-black rounded-2xl shadow-[5px_5px_0_0_#000] overflow-hidden">
      <header className={`${tone} flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b-2 border-black`}>
        <div className="flex items-baseline gap-2">
          <h2 className="font-paytone text-lg">{title}</h2>
          {subtitle && <span className="text-xs font-bold opacity-60 font-data">{subtitle}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function DataTable({
  head,
  alignRight = [],
  empty,
  children,
}: {
  head: ReactNode[];
  alignRight?: number[];
  empty?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-auto max-h-[560px]">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-skbw border-b-2 border-black">
          <tr className="text-[11px] uppercase tracking-widest font-extrabold text-gray-500">
            {head.map((h, i) => (
              <th key={i} className={`p-3 ${alignRight.includes(i) ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
          {empty && (
            <tr>
              <td colSpan={head.length} className="p-10 text-center text-gray-500 font-bold">{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 uppercase tracking-widest font-extrabold ${active ? "text-black" : "hover:text-black"}`}>
      {label}
      <span className="text-[9px]">{active ? (dir === "desc" ? "▼" : "▲") : "↕"}</span>
    </button>
  );
}

function ListScroll({ children }: { children: ReactNode }) {
  return <div className="max-h-[480px] overflow-y-auto divide-y divide-black/10">{children}</div>;
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-skbw/60 transition-colors">{children}</div>;
}

function Pill({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`inline-block text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 border-2 border-black rounded-full ${className}`}>
      {children}
    </span>
  );
}

function ContractItem({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-wrap justify-between items-center gap-2 border-b-2 border-black/10 pb-3 last:border-b-0 last:pb-0">
      <span className="font-bold text-sm">{label}</span>
      <CopyableText value={address} display={truncateMiddle(address, 10, 8)} variant="box" />
    </div>
  );
}
