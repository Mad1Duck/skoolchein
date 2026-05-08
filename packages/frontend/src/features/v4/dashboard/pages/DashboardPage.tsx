import { useAccount } from 'wagmi';
import { useDashboard } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { StatCard } from '@/components/ui/StatCard';
import { formatUnits } from 'viem';

import {
  InitiatorPanel,
  StudentPanel,
  VoterPanel,
  BountyHunterPanel,
  CommitteePanel,
} from '../components/Panels';
import { CreateProgramModal } from '../../programs/components/CreateProgramModal';
import { useState, useMemo } from 'react';
import { NeoButton } from '@/components/ui/NeoButton';

export function DashboardPage() {
  const { address } = useAccount();
  const { data: dashboard, isLoading } = useDashboard(address || '');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // ── Committee membership detection ───────────────────────────────────────────
  // Use DB-backed data from Ponder (committeePrograms) — this covers ALL programs
  // where the wallet is an active member, not just programs the user created.
  const committeePrograms = dashboard?.committeePrograms ?? [];
  const committeeProgramIds = useMemo(
    () => committeePrograms.map((p) => p.pid),
    [committeePrograms],
  );

  // ── Role detection ────────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
        <div className="bg-skyellow border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg p-10 inline-block">
          <h1 className="font-paytone text-3xl md:text-4xl mb-3">Connect Wallet</h1>
          <p className="text-gray-700 mb-6">Sign in to view your scholarships, votes, and reputation.</p>
          <NeoButton label="Connect Wallet" variant="connect" size="lg" />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <NeoSkeleton lines={8} />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
        <div className="bg-white border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg p-10 inline-block">
          <h1 className="font-paytone text-3xl md:text-4xl mb-3">No Data</h1>
          <p className="text-gray-600 mb-6">This wallet hasn't interacted with the protocol yet.</p>
          <NeoButton
            label="Browse Programs"
            variant="secondary"
            size="md"
            onClick={() => window.location.href = '/programs'}
          />
        </div>
      </div>
    );
  }

  const { summary, programsCreated, scholarships, votes, stakes, disputes, reputation } = dashboard;

  const roles: string[] = [];
  if (programsCreated.length > 0) roles.push('INITIATOR');
  if (scholarships.length > 0) roles.push('SCHOLAR');
  if (votes.length > 0 || stakes.length > 0) roles.push('VOTER');
  if (disputes.length > 0) roles.push('BOUNTY_HUNTER');
  if (committeeProgramIds.length > 0) roles.push('COMMITTEE');

  const roleFills: Record<string, string> = {
    INITIATOR: 'bg-skpink text-black',
    SCHOLAR: 'bg-skcyan text-black',
    VOTER: 'bg-skpurple text-white',
    BOUNTY_HUNTER: 'bg-skgreen text-black',
    COMMITTEE: 'bg-skyellow text-black',
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14">
      {/* Role Identity Banner */}
      <div className="border-2 border-black bg-white shadow-[4px_4px_0_0_#000] rounded-lg p-5 md:p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {roles.map((r) => (
                <span
                  key={r}
                  className={`px-2 py-1 ${roleFills[r] ?? 'bg-gray-100 text-black'} border-2 border-black text-[10px] font-extrabold uppercase tracking-widest`}
                >
                  {r.replace('_', ' ')}
                </span>
              ))}
              {roles.length === 0 && (
                <span className="px-2 py-1 bg-gray-100 text-black border-2 border-black text-[10px] font-extrabold uppercase tracking-widest">
                  NEWCOMER
                </span>
              )}
            </div>
            <h1 className="font-paytone text-3xl md:text-5xl leading-[0.95]">My Dashboard</h1>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <p className="text-xs font-data text-gray-400 uppercase tracking-widest">Connected</p>
            <p className="text-sm font-data text-gray-600">{address}</p>
          </div>
        </div>
      </div>

      {/* Stats: asymmetric, 4-up */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
        <StatCard
          label="Reputation"
          value={
            reputation
              ? Number(formatUnits(BigInt(reputation.repBalance), 18)).toFixed(2)
              : '0'
          }
          color="purple"
        />
        <StatCard label="Scholarships" value={summary.scholarshipsCount.toString()} color="green" />
        <StatCard label="Votes Cast" value={summary.votesCount.toString()} color="cyan" />
        <StatCard label="Disputes" value={summary.disputesCount.toString()} color="red" />
      </div>

      {/* Role Panels with visual separators */}
      <div className="space-y-10">
        <InitiatorPanel
          programs={programsCreated}
          onOpenCreateModal={() => setIsCreateModalOpen(true)}
        />

        <StudentPanel scholarships={scholarships} dashboardData={dashboard} />

        <VoterPanel votes={votes} stakes={stakes} dashboardData={dashboard} />

        <BountyHunterPanel disputes={disputes} dashboardData={dashboard} />

        <CommitteePanel
          programIds={committeeProgramIds}
          dashboardData={dashboard}
          address={address}
        />
      </div>

      <CreateProgramModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
}
