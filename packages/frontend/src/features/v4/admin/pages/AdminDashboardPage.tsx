import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { Navigate } from "@tanstack/react-router";
import { useAdminOverview, usePrograms, useApplicants, useScholars, type Program } from "@/lib/api";
import { v4Addresses, scholarshipCoreAbi } from "@/constants/contractsV4";
import { parseAbi } from "viem";
import { NeoButton } from "@/components/ui/NeoButton";
import { AdminControlModal } from "../components/AdminControlModal";
import { AdminProtocolConfig } from "../components/AdminProtocolConfig";
import { formatUnits } from "viem";

export function AdminDashboardPage() {
  const { address } = useAccount();
  const { data: adminAddress, isLoading: isContractLoading } = useReadContract({
    address: v4Addresses.ScholarshipCore,
    abi: scholarshipCoreAbi,
    functionName: "admin",
  });

  const { data: overview, isLoading: isOverviewLoading } = useAdminOverview();
  const { data: programsData } = usePrograms({ limit: 100 });
  const { data: applicantsData } = useApplicants();
  const { data: scholarsData } = useScholars();

  // Treasury
  const { data: treasuryBalance } = useReadContract({
    address: v4Addresses.MockUSDC,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [v4Addresses.ScholarshipTreasury],
  });
  
  const { data: protocolFee } = useReadContract({
    address: v4Addresses.ScholarshipTreasury,
    abi: parseAbi(["function protocolFeeAccumulated() view returns (uint256)"]),
    functionName: "protocolFeeAccumulated",
  });

  const [activeTab, setActiveTab] = useState<"programs" | "users" | "treasury" | "config">("programs");
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);

  if (isContractLoading || isOverviewLoading) {
    return <div className="p-8 text-center text-xl font-bold">Loading Admin Matrix...</div>;
  }

  const isAdmin = address && adminAddress && address.toLowerCase() === (adminAddress as string).toLowerCase();
  
  if (!isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 md:px-6 py-8">
      <div className="mb-6">
        <h1 className="font-paytone text-4xl md:text-5xl mb-2">Protocol Admin</h1>
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

      <div className="flex flex-wrap gap-1 border-b-2 border-black mb-6">
        {(["programs","users","treasury","config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              px-4 py-2 font-bold text-sm border-2 border-b-0 border-black rounded-t-md
              transition-all duration-100
              ${activeTab === tab
                ? 'bg-black text-white'
                : 'bg-gray-100 text-black hover:bg-gray-200'
              }
            `}
          >
            {tab === 'programs' ? 'Programs' : tab === 'users' ? 'Users & Roles' : tab === 'treasury' ? 'Treasury' : 'Protocol Config'}
          </button>
        ))}
      </div>

      {activeTab === "programs" && (
        <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md overflow-hidden">
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
                  <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-100">
                    <td className="p-3 font-bold font-data border-r-2 border-black text-center">{p.blockchainId}</td>
                    <td className="p-3 font-bold border-r-2 border-black">
                      <span className="bg-black text-white px-2 py-0.5 text-[10px] font-bold uppercase">{p.status}</span>
                    </td>
                    <td className="p-3 font-bold font-data border-r-2 border-black">${formatUnits(BigInt(p.totalFund || "0"), 6)}</td>
                    <td className="p-3 text-xs font-bold border-r-2 border-black text-gray-600 font-data">
                      {p.applicationStart ? new Date(p.applicationStart).toLocaleDateString() : "N/A"} - {p.votingEnd ? new Date(p.votingEnd).toLocaleDateString() : "N/A"}
                    </td>
                    <td className="p-3 font-bold text-xs border-r-2 border-black text-blue-600 font-data">
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
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md overflow-hidden">
            <h2 className="text-lg font-black p-3 border-b-2 border-black bg-yellow-200">System Creators</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {Array.from(new Set(programsData?.data.map(p => p.initiator) || [])).map((wallet, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{wallet.slice(0,10)}...{wallet.slice(-8)}</td>
                      <td className="p-3">
                        <span className="bg-yellow-100 text-yellow-800 font-bold text-[10px] px-2 py-0.5 border border-yellow-800">CORE_ROLE</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md overflow-hidden">
            <h2 className="text-lg font-black p-3 border-b-2 border-black bg-green-200">Global Applicants</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {applicantsData?.map((a, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{a.applicant.wallet.slice(0,8)}...</td>
                      <td className="p-3 font-bold text-gray-500 font-data">Prog #{a.program?.pid}</td>
                      <td className="p-3">
                        <span className="bg-black text-white text-[10px] px-2 py-0.5 font-bold uppercase">{a.applicant.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md overflow-hidden">
            <h2 className="text-lg font-black p-3 border-b-2 border-black bg-skpurple text-white">Global Scholars</h2>
            <div className="overflow-y-auto max-h-[500px]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {scholarsData?.map((s, i) => (
                    <tr key={i} className="border-b border-gray-200">
                      <td className="p-3 font-bold font-data">{s.scholar.wallet.slice(0,8)}...</td>
                      <td className="p-3 font-bold text-gray-500 font-data">Prog #{s.program?.pid}</td>
                      <td className="p-3 font-bold text-green-600 border-l-2 pl-3 font-data">
                        ${formatUnits(BigInt(s.scholar.totalReceived || "0"), 6)}
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
          <div className="bg-[#eef2ff] border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-5">
            <h2 className="text-2xl font-black mb-4">Treasury Overview</h2>
            <div className="space-y-3">
              <div className="bg-white border-2 border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
                <span className="font-bold text-gray-600 text-xs uppercase tracking-wider">Total Backing (USDC)</span>
                <span className="text-2xl font-black font-data text-green-600">
                  ${treasuryBalance !== undefined ? formatUnits(treasuryBalance as bigint, 6) : "0.0"}
                </span>
              </div>
              <div className="bg-white border-2 border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
                <span className="font-bold text-gray-600 text-xs uppercase tracking-wider">Protocol Revenue</span>
                <span className="text-xl font-black font-data text-blue-600">
                  ${protocolFee !== undefined ? formatUnits(protocolFee as bigint, 6) : "0.0"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#fff7ed] border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-5">
            <h2 className="text-2xl font-black mb-4">Contract Registry</h2>
            <div className="space-y-3">
              <ContractItem label="ScholarshipCore" address={v4Addresses.ScholarshipCore} />
              <ContractItem label="TreasuryVault" address={v4Addresses.ScholarshipTreasury} />
              <ContractItem label="Bounty/Dispute" address={v4Addresses.ScholarshipBounty} />
              <ContractItem label="Reputation (NFT)" address={v4Addresses.ScholarshipReputation} />
            </div>
          </div>

          <div className="md:col-span-2 bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md overflow-hidden">
            <h2 className="text-lg font-black p-3 border-b-2 border-black bg-blue-100">Revenue Breakdown by Program</h2>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b-2 border-black">
                  <tr className="text-xs uppercase font-black text-gray-500">
                    <th className="p-3">Prog ID</th>
                    <th className="p-3 text-right">Revenue Collected (USDC)</th>
                    <th className="p-3 text-right">Total Fund (USDC)</th>
                    <th className="p-3 text-right">Fee Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {programsData?.data.filter(p => Number(p.protocolFeeCollected) > 0).sort((a, b) => Number(b.protocolFeeCollected) - Number(a.protocolFeeCollected)).map(p => (
                    <tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-100">
                      <td className="p-3 font-bold font-data">#{p.blockchainId}</td>
                      <td className="p-3 text-right font-data text-blue-600">${formatUnits(BigInt(p.protocolFeeCollected), 6)}</td>
                      <td className="p-3 text-right text-xs text-gray-600 font-data">${formatUnits(BigInt(p.totalFund), 6)}</td>
                      <td className="p-3 text-right">
                        <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 border border-blue-200">
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
        <AdminProtocolConfig />
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
    <div className={`${color} border-2 border-black rounded-md p-3 flex flex-col justify-center items-center shadow-[3px_3px_0_0_#000]`}>
      <div className="text-2xl font-black mb-1 font-data">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{title}</div>
    </div>
  );
}

function ContractItem({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex justify-between items-center border-b-2 border-gray-300 pb-2">
      <span className="font-bold text-sm">{label}</span>
      <span className="bg-gray-100 text-gray-600 font-data text-xs p-1 border border-gray-300">
        {address.slice(0, 10)}...{address.slice(-8)}
      </span>
    </div>
  );
}
