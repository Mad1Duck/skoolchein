/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useToggleOpenDonation } from '@/lib/contracts/write-hooks';
import { DonateModal } from '../components/DonateModal';
import { VoteModal } from '../components/VoteModal';
import { ConfidenceStakeModal } from '../components/ConfidenceStakeModal';
import { SelectWinnersModal } from '../components/SelectWinnersModal';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useProgram,
  useProgramApplicants,
  useProgramScholars,
  useProgramMilestones,
  useProgramVotes,
  useProgramDisputes,
} from '@/lib/api/hooks';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { ProgramMetadata } from '@/lib/api/types';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { PhaseTimeline } from '@/components/ui/PhaseTimeline';
import { StatCard } from '@/components/ui/StatCard';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';

type Tab = 'overview' | 'applicants' | 'scholars' | 'milestones' | 'votes' | 'disputes';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'applicants', label: 'Applicants' },
  { key: 'scholars', label: 'Scholars' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'votes', label: 'Votes' },
  { key: 'disputes', label: 'Disputes' },
];

function formatUSDC(raw: string | bigint | number): string {
  const n = typeof raw === 'bigint' ? Number(raw) / 1e6 : Number(raw) / 1e6;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ProgramDetailPage() {
  const { id } = useParams({ from: '/programs/$id/' });
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const [isVoteOpen, setIsVoteOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<{ address: `0x${string}`; name?: string } | null>(null);
  const [isStakeOpen, setIsStakeOpen] = useState(false);
  const [selectedScholar, setSelectedScholar] = useState<{ address: `0x${string}`; name?: string } | null>(null);
  const [isSelectWinnersOpen, setIsSelectWinnersOpen] = useState(false);

  const { address: userAddress } = useAccount();
  const { toggle, isPending: isToggling } = useToggleOpenDonation();
  const { data: program, isLoading } = useProgram(id);
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });

  // Sub-resource queries (lazy loaded on tab switch)
  const applicantsQ = useProgramApplicants(activeTab === 'applicants' ? id : '');
  const scholarsQ = useProgramScholars(activeTab === 'scholars' ? id : '');
  const milestonesQ = useProgramMilestones(activeTab === 'milestones' ? id : '');
  const votesQ = useProgramVotes(activeTab === 'votes' ? id : '');
  const disputesQ = useProgramDisputes(activeTab === 'disputes' ? id : '');


  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-14 space-y-6">
        <NeoSkeleton lines={3} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <NeoSkeleton key={i} lines={2} />
          ))}
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
        <div className="bg-white border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg p-10 inline-block">
          <h2 className="font-paytone text-3xl mb-3">Program Not Found</h2>
          <p className="text-gray-600 mb-6">This program does not exist or has been removed.</p>
          <Link to="/programs">
            <NeoButton label="Back to Programs" variant="secondary" size="md" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/programs" className="font-bold hover:text-skpurple transition-colors duration-75">
          Programs
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-bold text-black">{meta?.name ?? `Program #${program.pid}`}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-2">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-paytone text-3xl md:text-5xl leading-[0.95]">
              {meta?.name ?? `Program #${program.pid}`}
            </h1>
            <NeoBadge status={program.status} />
          </div>
          {meta?.description && (
            <p className="text-gray-600 text-base md:text-lg max-w-2xl leading-relaxed">{meta.description}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <WalletAvatar address={program.initiator} size={20} />
            <span className="font-data">{shortenAddress(program.initiator)}</span>
            {meta?.organization && <span className="text-gray-300">|</span>}
            {meta?.organization && <span className="font-medium">{meta.organization}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {userAddress === program.initiator && (
            <button
              disabled={isToggling}
              onClick={() => toggle(BigInt(program.pid), !program.openDonation)}
              className={`
                px-3 py-1.5 border-2 border-black text-[10px] font-extrabold uppercase tracking-widest
                transition-all duration-75
                ${program.openDonation
                  ? 'bg-skgreen text-black shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                  : 'bg-gray-200 text-gray-600 shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                }
                disabled:opacity-40 disabled:shadow-none disabled:translate-x-[2px] disabled:translate-y-[2px]
              `}
            >
              {program.openDonation ? 'Public: ON' : 'Public: OFF'}
            </button>
          )}
          {program.status === 'APPLICATION_OPEN' && (
            <Link to="/apply/$id" params={{ id: String(program.pid) }}>
              <NeoButton label="Apply Now" variant="primary" size="md" />
            </Link>
          )}
          {program.status === 'VOTING' && program.openDonation && (
            <NeoButton
              label="Cast Vote"
              variant="primary"
              size="md"
              onClick={() => setActiveTab('applicants')}
            />
          )}
          {program.openDonation && (
            <NeoButton
              label="Donate"
              variant="success"
              size="md"
              onClick={() => setIsDonateOpen(true)}
            />
          )}
          {userAddress === program.initiator && program.status === 'VOTING' && (
            <NeoButton
              label="Select Winners"
              variant="secondary"
              size="md"
              onClick={() => setIsSelectWinnersOpen(true)}
            />
          )}
        </div>
      </div>

      {isDonateOpen && (
        <DonateModal
          isOpen={isDonateOpen}
          onClose={() => setIsDonateOpen(false)}
          programId={program.pid}
          programName={meta?.name}
        />
      )}

      {isVoteOpen && selectedCandidate && (
        <VoteModal
          isOpen={isVoteOpen}
          onClose={() => setIsVoteOpen(false)}
          programId={BigInt(program.pid)}
          candidateAddress={selectedCandidate.address}
          candidateName={selectedCandidate.name}
        />
      )}

      {isStakeOpen && selectedScholar && (
        <ConfidenceStakeModal
          isOpen={isStakeOpen}
          onClose={() => setIsStakeOpen(false)}
          programId={BigInt(program.pid)}
          scholarAddress={selectedScholar.address}
          scholarName={selectedScholar.name}
        />
      )}

      {isSelectWinnersOpen && (
        <SelectWinnersForProgram
          program={program}
          onClose={() => setIsSelectWinnersOpen(false)}
        />
      )}

      {/* Phase timeline */}
      <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-5 md:p-6">
        <PhaseTimeline currentStatus={program.status} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Fund" value={`$${formatUSDC(program.totalFund)}`} color="green" />
        <StatCard label="Spent" value={`$${formatUSDC(program.spentFund)}`} color="orange" />
        <StatCard label="Applicants" value={program.applicantCount} color="yellow" />
        <StatCard label="Active Scholars" value={program.activeScholarCount} color="purple" />
      </div>

      {/* Tabs — block style */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const count =
            tab.key === 'applicants' && program._counts?.applicants
              ? program._counts.applicants
              : tab.key === 'scholars' && program._counts?.scholars
                ? program._counts.scholars
                : tab.key === 'disputes' && program._counts?.disputes
                  ? program._counts.disputes
                  : null;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-3 py-1.5 border-2 font-bold text-xs uppercase tracking-wider
                transition-all duration-75
                ${activeTab === tab.key
                  ? 'bg-black text-white border-black shadow-none translate-x-[2px] translate-y-[2px]'
                  : 'bg-white text-black border-black shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none'
                }
              `}>
              {tab.label}
              {count !== null && <span className="ml-1 opacity-60 font-data">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'overview' && <OverviewTab program={program} meta={meta ?? undefined} />}
        {activeTab === 'applicants' && (
          <ListTab
            data={applicantsQ.data}
            isLoading={applicantsQ.isLoading}
            renderItem={(a) => (
              <div key={a.wallet} className="flex items-center justify-between p-4 md:p-5 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={a.wallet} size={32} />
                  <div className="min-w-0">
                    <p className="font-bold font-data text-sm">{shortenAddress(a.wallet)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Score <span className="font-data font-bold">{a.totalScore ?? '—'}</span> · Retry <span className="font-data">{a.retryCount}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <NeoBadge status={a.status} />
                  {program.status === 'VOTING' && program.openDonation && a.status === 'SHORTLISTED' && (
                    <NeoButton
                      label="Vote"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedCandidate({ address: a.wallet as `0x${string}` });
                        setIsVoteOpen(true);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          />
        )}
        {activeTab === 'scholars' && (
          <ListTab
            data={scholarsQ.data}
            isLoading={scholarsQ.isLoading}
            renderItem={(s) => (
              <div key={s.wallet} className="flex items-center justify-between p-4 md:p-5 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={s.wallet} size={32} />
                  <div className="min-w-0">
                    <p className="font-bold font-data text-sm">{shortenAddress(s.wallet)}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Received <span className="font-data font-bold">${formatUSDC(s.totalReceived)}</span> · Milestone <span className="font-data">{s.currentMilestone}/{s.totalMilestones}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <NeoBadge status={s.status} />
                  {program.openDonation && s.status === 'ACTIVE' && (
                    <NeoButton
                      label="Stake"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedScholar({ address: s.wallet as `0x${string}` });
                        setIsStakeOpen(true);
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          />
        )}
        {activeTab === 'milestones' && (
          <ListTab
            data={milestonesQ.data}
            isLoading={milestonesQ.isLoading}
            renderItem={(m) => (
              <div key={m.blockchainId} className="flex items-center justify-between p-4 md:p-5 gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-sm">Milestone <span className="font-data">#{m.blockchainId}</span></p>
                  <p className="text-[11px] text-gray-500 font-data mt-0.5">
                    {m.scholarWallet ? shortenAddress(m.scholarWallet) : '—'} · ${formatUSDC(m.amount)}
                  </p>
                </div>
                <NeoBadge status={m.status} />
              </div>
            )}
          />
        )}
        {activeTab === 'votes' && (
          <ListTab
            data={votesQ.data}
            isLoading={votesQ.isLoading}
            renderItem={(v) => (
              <div key={v.voterAddress} className="flex items-center justify-between p-4 md:p-5 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={v.voterAddress} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-bold font-data">{shortenAddress(v.voterAddress)}</span>{' '}
                      <span className="text-gray-500">voted for</span>{' '}
                      <span className="font-bold font-data text-skpurple">
                        {shortenAddress(v.candidateAddress)}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">Weight <span className="font-data font-bold">{v.votingWeight}</span></p>
                  </div>
                </div>
              </div>
            )}
          />
        )}
        {activeTab === 'disputes' && (
          <ListTab
            data={disputesQ.data}
            isLoading={disputesQ.isLoading}
            renderItem={(d) => (
              <div key={d.blockchainId} className="flex items-center justify-between p-4 md:p-5 gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-sm">
                    Dispute <span className="font-data">#{d.blockchainId}</span>{' '}
                    <span className="text-[10px] font-extrabold font-data uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 border border-black">
                      {d.disputeType.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500 font-data mt-0.5">
                    BH {shortenAddress(d.bountyHunter)} <span className="text-gray-300">vs</span> Scholar {shortenAddress(d.scholarAddress)}
                  </p>
                </div>
                <NeoBadge status={d.status} />
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ program }: { program: any; meta?: ProgramMetadata }) {
  const grossTotal = BigInt(program.totalFund) + BigInt(program.protocolFeeCollected || 0);
  const unallocated = Number(program.totalFund) - Number(program.allocatedFund);
  const pctSpent = (Number(program.spentFund) / Math.max(1, Number(program.totalFund))) * 100;
  const pctAllocated = ((Number(program.allocatedFund) - Number(program.spentFund)) / Math.max(1, Number(program.totalFund))) * 100;
  const pctUnallocated = (unallocated / Math.max(1, Number(program.totalFund))) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <NeoCard fill="cream" hoverable={false}>
        <NeoCardBody className="space-y-5">
          <h3 className="font-paytone text-lg">Program Details</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Max Candidates</dt>
              <dd className="font-bold font-data text-base">{program.maxCandidates}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Target Winners</dt>
              <dd className="font-bold font-data text-base">{program.targetWinners}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Screening Mode</dt>
              <dd className="font-bold">{program.screeningMode === 0 ? 'By Committee' : 'By Student'}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Education Level</dt>
              <dd className="font-bold">{['SD', 'SMP', 'SMA', 'University'][program.educationLevel] ?? '—'}</dd>
            </div>
          </dl>
        </NeoCardBody>
      </NeoCard>

      <NeoCard fill="yellow" hoverable={false}>
        <NeoCardBody className="space-y-5">
          <h3 className="font-paytone text-lg">Financial Summary</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Gross Total</dt>
              <dd className="font-bold font-data">${formatUSDC(grossTotal)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-skpurple font-bold text-xs uppercase tracking-wider">Net Total Fund</dt>
              <dd className="font-bold text-skpurple font-data text-base">${formatUSDC(program.totalFund)}</dd>
            </div>
            <div className="flex justify-between items-baseline border-t-2 border-black/10 pt-2">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Allocated</dt>
              <dd className="font-bold font-data">${formatUSDC(program.allocatedFund)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Spent</dt>
              <dd className="font-bold text-orange-600 font-data">${formatUSDC(program.spentFund)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">Yield Accrued</dt>
              <dd className="font-bold text-skpurple font-data">${formatUSDC(program.yieldAccrued)}</dd>
            </div>
          </dl>

          {/* Allocation Breakdown Bar */}
          <div className="pt-1">
            <h4 className="font-bold text-[10px] uppercase text-gray-500 tracking-widest mb-2">Fund Allocation</h4>
            <div className="flex h-5 w-full bg-white border-2 border-black overflow-hidden">
              <div
                className="h-full bg-skgreen border-r-2 border-black"
                style={{ width: `${pctSpent}%` }}
                title={`Spent: $${formatUSDC(program.spentFund)}`}
              />
              <div
                className="h-full bg-skyellow border-r-2 border-black"
                style={{ width: `${pctAllocated}%` }}
                title={`Pending: $${formatUSDC(BigInt(program.allocatedFund) - BigInt(program.spentFund))}`}
              />
              <div
                className="h-full bg-gray-200"
                style={{ width: `${pctUnallocated}%` }}
                title={`Unallocated: $${formatUSDC(unallocated)}`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-600 mt-1.5 uppercase tracking-wider">
              <span className="text-green-700">Spent {pctSpent.toFixed(0)}%</span>
              <span className="text-yellow-700">Pending {pctAllocated.toFixed(0)}%</span>
              <span>Unallocated {pctUnallocated.toFixed(0)}%</span>
            </div>
          </div>
        </NeoCardBody>
      </NeoCard>
    </div>
  );
}

function ListTab<T>({
  data,
  isLoading,
  renderItem,
}: {
  data: T[] | undefined;
  isLoading: boolean;
  renderItem: (item: T) => React.ReactNode;
}) {
  if (isLoading) return <NeoSkeleton lines={5} className="py-4" />;
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-10 text-center">
        <p className="font-paytone text-lg mb-1">No data yet</p>
        <p className="text-gray-500 text-sm">Items will appear here once activity begins.</p>
      </div>
    );
  }
  return (
    <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
      <div className="divide-y-2 divide-gray-100">{data.map(renderItem)}</div>
    </div>
  );
}

function SelectWinnersForProgram({ program, onClose }: { program: any; onClose: () => void }) {
  const { data: applicants = [] } = useProgramApplicants(String(program.pid));
  const shortlisted = applicants.filter((a) => a.status === 'SHORTLISTED');
  return (
    <SelectWinnersModal
      isOpen
      onClose={onClose}
      programId={program.pid}
      shortlisted={shortlisted}
      targetWinners={program.targetWinners}
    />
  );
}
