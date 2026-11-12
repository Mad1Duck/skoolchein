import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Navigate } from "@tanstack/react-router";
import { useAdminOverview, usePrograms, useApplicants, useScholars, type Program } from "@/lib/api";
import { scholarshipCoreAbi } from "@/constants/contractsV4";
import { useActiveChain, useV4Addresses } from '@/lib/chain/useActiveChain';
import { parseAbi } from "viem";
import { NeoButton } from "@/components/ui/NeoButton";
import { NeoSkeleton } from "@/components/ui/NeoSkeleton";
import { AdminControlModal } from "../components/AdminControlModal";
import { AdminProtocolConfig } from "../components/AdminProtocolConfig";
import { AdminTokenOracle } from "../components/AdminTokenOracle";
import { formatUnits } from "viem";
import { formatTokenWithSymbol } from "@/lib/contracts/v4/token";

export function AdminDashboardPage() {
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

  const [activeTab, setActiveTab] = useState<"programs" | "users" | "treasury" | "config">("programs");
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

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
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-paytone text-3xl md:text-5xl leading-[0.95] mb-2">Protocol Admin</h1>
        <p className="text-gray-500 font-bold text-sm">Global oversight and matrix control.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
          <StatCard title="Programs" value={overview.totalPrograms} color="bg-blue-200" />
          <StatCard title="Creators" value={overview.totalCreators} color="bg-yellow-200" />
          <StatCard title="Applicants" value={overview.totalApplicants} color="bg-green-200" />
          <StatCard title="Scholars" value={overview.totalScholars} color="bg-skpurple text-white" />
          <StatCard title="Milestones" value={overview.totalMilestones} color="bg-orange-200" />
          <StatCard title="Disputes" value={overview.totalDisputes} color="bg-red-200" />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-8">
        {(["programs","users","treasury","config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-1.5 font-bold text-xs uppercase tracking-wider border-2
              transition-all duration-75
              ${activeTab === tab
                ? 'bg-black text-white border-black shadow-none translate-x-[2px] translate-y-[2px]'
                : 'bg-white text-black border-black shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
              }
            `}
          >
            {tab === 'programs' ? 'Programs' : tab === 'users' ? 'Users & Roles' : tab === 'treasury' ? 'Treasury' : 'Config'}
          </button>
        ))}
      </div>

      {activeTab === "programs" && (
        <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 border-b-2 border-black">
                  <th className="p-3 font-black border-r-2 border-black">ID</th>
                  <th className="p-3 font-black border-r-2 border-black">Status</th>
                  <th className="p-3 font-black border-r-2 border-black">Fund</th>
                  <th className="p-3 font-black border-r-2 border-black">Date Range</th>
                  <th className="p-3 font-black border-r-2 border-black">Initiator</th>
                  <th className="p-3 font-black text-center">Admin</th>
                </tr>
              </thead>
              <tbody>
                {programsData?.data.map((p) => (
                  <tr key={p.pid} className="border-b border-gray-200">
                    <td className="p-3 font-bold font-data border-r-2 border-black text-center">{p.pid}</td>
                    <td className="p-3 font-bold border-r-2 border-black">
                      <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black bg-black text-white">{p.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="p-3 font-bold font-data border-r-2 border-black">{formatTokenWithSymbol(p.totalFund || "0", p.token)}</td>
                    <td className="p-3 text-xs font-bold border-r-2 border-black text-gray-600 font-data">
                      {p.applicationStart ? new Date(p.applicationStart).toLocaleDateString() : "N/A"} – {p.votingEnd ? new Date(p.votingEnd).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="p-3 font-bold text-xs border-r-2 border-black text-skpurple font-data">
                      {p.initiator.slice(0,6)}...{p.initiator.slice(-4)}
                    </td>
                    <td className="p-3 text-center">
                      <NeoButton label="Override" variant="secondary" size="sm" onClick={() => setSelectedProgram(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
            <h2 className="text-sm font-black p-3 border-b-2 border-black bg-skyellow uppercase tracking-wider">System Creators</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {Array.from(new Set(programsData?.data.map(p => p.initiator) || [])).map((wallet, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{wallet.slice(0,10)}...{wallet.slice(-8)}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black bg-skyellow">CORE_ROLE</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
            <h2 className="text-sm font-black p-3 border-b-2 border-black bg-skgreen uppercase tracking-wider">Global Applicants</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {applicantsData?.map((a, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{a.applicant.wallet.slice(0,8)}...</td>
                      <td className="p-3 font-bold text-gray-500 font-data">Prog #{a.program?.pid}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black bg-black text-white">{a.applicant.status.replace(/_/g, ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
            <h2 className="text-sm font-black p-3 border-b-2 border-black bg-skpurple text-white uppercase tracking-wider">Global Scholars</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {scholarsData?.map((s, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{s.scholar.wallet.slice(0,8)}...</td>
                      <td className="p-3 font-bold text-gray-500 font-data">Prog #{s.program?.pid}</td>
                      <td className="p-3 font-bold text-skpurple border-l-2 pl-3 font-data">
                        {formatTokenWithSymbol(s.scholar.totalReceived || "0", s.program?.token)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "treasury" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-skpurple-light border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-5">
            <h2 className="font-paytone text-xl mb-4">Treasury Overview</h2>
            <div className="space-y-3">
              <div className="bg-white border-2 border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
                <span className="font-bold text-gray-600 text-[10px] uppercase tracking-widest">Total Backing (USDC)</span>
                <span className="text-2xl font-black font-data text-skpurple">
                  ${treasuryBalance !== undefined ? formatUnits(treasuryBalance as bigint, 6) : "0.0"}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
                <span className="font-bold text-gray-600 text-[10px] uppercase tracking-widest">Protocol Revenue</span>
                <span className="text-xl font-black font-data text-skpurple">
                  ${protocolFee !== undefined ? formatUnits(protocolFee as bigint, 6) : "0.0"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-skbw border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-5">
            <h2 className="font-paytone text-xl mb-4">Contract Registry</h2>
            <div className="space-y-3">
              <ContractItem label="ScholarshipCore" address={v4Addresses.ScholarshipCore} />
              <ContractItem label="TreasuryVault" address={v4Addresses.ScholarshipTreasury} />
              <ContractItem label="Bounty/Dispute" address={v4Addresses.ScholarshipBounty} />
              <ContractItem label="Reputation (NFT)" address={v4Addresses.ScholarshipReputation} />
            </div>
          </div>

          <div className="md:col-span-2 bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
            <h2 className="text-sm font-black p-3 border-b-2 border-black bg-skyellow uppercase tracking-wider">Revenue Breakdown by Program</h2>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b-2 border-black">
                  <tr className="text-xs uppercase font-black text-gray-500">
                    <th className="p-3">Prog ID</th>
                    <th className="p-3 text-right">Revenue Collected</th>
                    <th className="p-3 text-right">Total Fund</th>
                    <th className="p-3 text-right">Fee Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {programsData?.data.filter(p => Number(p.protocolFeeCollected) > 0).sort((a, b) => Number(b.protocolFeeCollected) - Number(a.protocolFeeCollected)).map(p => (
                    <tr key={p.pid} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">#{p.pid}</td>
                      <td className="p-3 text-right font-data text-skpurple">{formatTokenWithSymbol(p.protocolFeeCollected, p.token)}</td>
                      <td className="p-3 text-right text-xs text-gray-600 font-data">{formatTokenWithSymbol(p.totalFund, p.token)}</td>
                      <td className="p-3 text-right">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 border-2 border-black bg-skyellow">
                          {((Number(p.protocolFeeCollected) / Number(p.totalFund)) * 100).toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {programsData?.data.filter(p => Number(p.protocolFeeCollected) > 0).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500 font-bold">No revenue collected yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "config" && (
        <div className="space-y-8">
          <AdminProtocolConfig />
          <AdminTokenOracle />
        </div>
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

function StatCard({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div className={`${color} border-2 border-black rounded-lg p-3 flex flex-col justify-center items-center shadow-[3px_3px_0_0_#000]`}>
      <div className="text-2xl font-black mb-1 font-data">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{title}</div>
    </div>
  );
}

function ContractItem({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex justify-between items-center border-b-2 border-black/10 pb-2">
      <span className="font-bold text-sm">{label}</span>
      <span className="bg-white text-gray-600 font-data text-xs px-2 py-1 border-2 border-black shadow-[2px_2px_0_0_#000]">
        {address.slice(0, 10)}...{address.slice(-8)}
      </span>
    </div>
  );
}
