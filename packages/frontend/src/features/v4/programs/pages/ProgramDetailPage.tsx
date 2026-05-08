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

function formatUSDC(raw: string | bigint): string {
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

  console.log(program?.status, '=====program====', program?.status === 'APPLICATION_OPEN');

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 space-y-6">
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
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-24 text-center">
        <h2 className="font-paytone text-2xl mb-2">Program Not Found</h2>
        <p className="text-gray-600 mb-4">This program does not exist or has been removed.</p>
        <Link to="/programs" className="text-skpurple font-bold">
          Back to Programs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/programs" className="font-bold hover:text-skpurple transition-colors duration-100">
          Programs
        </Link>
        <span>/</span>
        <span className="font-bold text-black">{meta?.name ?? `Program #${program.pid}`}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-paytone text-3xl md:text-4xl">
              {meta?.name ?? `Program #${program.pid}`}
            </h1>
            <NeoBadge status={program.status} />
          </div>
          {meta?.description && (
            <p className="text-gray-600 text-base md:text-lg max-w-2xl">{meta.description}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <WalletAvatar address={program.initiator} size={20} />
            <span className="font-data">{shortenAddress(program.initiator)}</span>
            {meta?.organization && <span className="text-gray-400">|</span>}
            {meta?.organization && <span>{meta.organization}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {userAddress === program.initiator && (
            <button
              disabled={isToggling}
              onClick={() => toggle(BigInt(program.pid), !program.openDonation)}
              className={`
                px-3 py-1.5 rounded-md border-2 border-black text-xs font-bold uppercase
                transition-all duration-100
                ${program.openDonation
                  ? 'bg-skgreen text-black shadow-[3px_3px_0_0_#000] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none'
                  : 'bg-gray-200 text-gray-600 shadow-[3px_3px_0_0_#000] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none'
                }
                disabled:opacity-50 disabled:shadow-none disabled:translate-x-[3px] disabled:translate-y-[3px]
              `}
            >
              {program.openDonation ? 'Public: ON' : 'Public: OFF'}
            </button>
          )}
          {program.status === 'APPLICATION_OPEN' && (
            <Link to="/apply/$id" params={{ id: program.id }}>
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
      <NeoCard hoverable={false} className="p-6">
        <PhaseTimeline currentStatus={program.status} />
      </NeoCard>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Fund" value={`$${formatUSDC(program.totalFund)}`} color="green" />
        <StatCard label="Spent" value={`$${formatUSDC(program.spentFund)}`} color="orange" />
        <StatCard label="Applicants" value={program.applicantCount} color="yellow" />
        <StatCard label="Active Scholars" value={program.activeScholarCount} color="purple" />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b-2 border-black pb-0">
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
                px-3 py-2 rounded-t-md border-2 border-b-0 font-bold text-sm
                transition-all duration-100
                ${activeTab === tab.key
                  ? 'bg-white border-black z-10 mb-[-2px]'
                  : 'bg-gray-100 border-transparent hover:bg-gray-200'
                }
              `}>
              {tab.label}
              {count !== null && <span className="ml-1 text-gray-500">({count})</span>}
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
              <div key={a.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={a.wallet} size={32} />
                  <div className="min-w-0">
                    <p className="font-bold font-data text-sm">{shortenAddress(a.wallet)}</p>
                    <p className="text-xs text-gray-500">
                      Score: {a.totalScore ?? '—'} | Retry: {a.retryCount}
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
              <div key={s.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={s.wallet} size={32} />
                  <div className="min-w-0">
                    <p className="font-bold font-data text-sm">{shortenAddress(s.wallet)}</p>
                    <p className="text-xs text-gray-500">
                      Received ${formatUSDC(s.totalReceived)} | Milestone {s.currentMilestone}/{s.totalMilestones}
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
              <div key={m.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="font-bold text-sm">Milestone <span className="font-data">#{m.blockchainId}</span></p>
                  <p className="text-xs text-gray-500 font-data">
                    {shortenAddress(m.scholarWallet)} | ${formatUSDC(m.amount)}
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
              <div key={v.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <WalletAvatar address={v.voterAddress} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-bold font-data">{shortenAddress(v.voterAddress)}</span>{' '}
                      voted for{' '}
                      <span className="font-bold font-data text-skpurple">
                        {shortenAddress(v.candidateAddress)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">Weight: {v.votingWeight}</p>
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
              <div key={d.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="font-bold text-sm">
                    Dispute <span className="font-data">#{d.blockchainId}</span>{' '}
                    <span className="text-xs font-data bg-gray-100 px-2 py-0.5 border border-gray-200">
                      {d.disputeType}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 font-data">
                    BH {shortenAddress(d.bountyHunter)} vs Scholar {shortenAddress(d.scholarAddress)}
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NeoCard hoverable={false}>
        <NeoCardBody className="space-y-4">
          <h3 className="font-paytone text-lg">Program Details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Max Candidates</dt>
              <dd className="font-bold font-data">{program.maxCandidates}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Target Winners</dt>
              <dd className="font-bold font-data">{program.targetWinners}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Screening Mode</dt>
              <dd className="font-bold">{program.screeningMode === 0 ? 'By Committee' : 'By Student'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Education Level</dt>
              <dd className="font-bold">{['SD', 'SMP', 'SMA', 'University'][program.educationLevel] ?? '—'}</dd>
            </div>
          </dl>
        </NeoCardBody>
      </NeoCard>

      <NeoCard hoverable={false}>
        <NeoCardBody className="space-y-4">
          <h3 className="font-paytone text-lg">Financial Summary</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Gross Total (incl. Fee)</dt>
              <dd className="font-bold font-data">${formatUSDC(BigInt(program.totalFund) + BigInt(program.protocolFeeCollected || 0))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-skpurple font-bold">Net Total Fund</dt>
              <dd className="font-bold text-skpurple font-data">${formatUSDC(program.totalFund)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-gray-200 pt-2 mt-1">
              <dt className="text-gray-500">Allocated</dt>
              <dd className="font-bold font-data">${formatUSDC(program.allocatedFund)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Spent</dt>
              <dd className="font-bold text-orange-600 font-data">${formatUSDC(program.spentFund)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Yield Accrued</dt>
              <dd className="font-bold text-skblue font-data">${formatUSDC(program.yieldAccrued)}</dd>
            </div>
          </dl>

          {/* Allocation Breakdown Bar */}
          <div className="pt-2">
            <h4 className="font-bold text-[10px] uppercase text-gray-500 tracking-wider mb-2">Fund Allocation</h4>
            <div className="flex h-4 w-full bg-gray-200 border-2 border-black overflow-hidden">
              <div
                className="h-full bg-skgreen"
                style={{ width: `${(Number(program.spentFund) / Math.max(1, Number(program.totalFund))) * 100}%` }}
                title={`Spent: $${formatUSDC(program.spentFund)}`}
              />
              <div
                className="h-full bg-skyellow"
                style={{ width: `${((Number(program.allocatedFund) - Number(program.spentFund)) / Math.max(1, Number(program.totalFund))) * 100}%` }}
                title={`Pending: $${formatUSDC(BigInt(program.allocatedFund) - BigInt(program.spentFund))}`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-600 mt-1 uppercase tracking-wider">
              <span className="text-green-700">Spent {((Number(program.spentFund) / Math.max(1, Number(program.totalFund))) * 100).toFixed(0)}%</span>
              <span className="text-yellow-700">Pending {(((Number(program.allocatedFund) - Number(program.spentFund)) / Math.max(1, Number(program.totalFund))) * 100).toFixed(0)}%</span>
              <span>Unallocated {(((Number(program.totalFund) - Number(program.allocatedFund)) / Math.max(1, Number(program.totalFund))) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </NeoCardBody>
      </NeoCard>
    </div>
  );
}

function ListTab<T extends { id?: string }>({
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
      <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-md p-8 text-center">
        <p className="font-bold text-gray-500">No data yet</p>
      </div>
    );
  }
  return (
    <NeoCard hoverable={false}>
      <div className="divide-y-2 divide-gray-100">{data.map(renderItem)}</div>
    </NeoCard>
  );
}

function SelectWinnersForProgram({ program, onClose }: { program: any; onClose: () => void }) {
  const { data: applicants = [] } = useProgramApplicants(program.id);
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
