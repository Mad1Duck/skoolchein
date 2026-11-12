/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useToggleOpenDonation } from '@/lib/contracts/write-hooks';
import { DonateModal } from '../components/DonateModal';
import { VoteModal } from '../components/VoteModal';
import { ConfidenceStakeModal } from '../components/ConfidenceStakeModal';
import { SelectWinnersModal } from '../components/SelectWinnersModal';
import { ResolveShortlistModal } from '../components/ResolveShortlistModal';
import { MyRecommendationsCard } from '../components/MyRecommendationsCard';
import { ApplicantRow } from '../components/ApplicantRow';
import { ProgramFundingCard } from '../components/ProgramFundingCard';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  useProgram,
  useProgramApplicants,
  useProgramScholars,
  useProgramMilestones,
  useProgramVotes,
  useProgramRecommendations,
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
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { toDate } from '@/lib/time';
import { effectiveStatus } from '@/lib/programStatus';
import { useFormatMoney } from '@/lib/money';

type Tab = 'overview' | 'applicants' | 'scholars' | 'milestones' | 'votes' | 'disputes';

const TAB_KEYS: Tab[] = ['overview', 'applicants', 'scholars', 'milestones', 'votes', 'disputes'];

export function ProgramDetailPage() {
  const { t } = useT();
  const fmtAmount = useFormatMoney();
  const { id } = useParams({ from: '/programs/$id/' });
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [isDonateOpen, setIsDonateOpen] = useState(false);
  const [donateAmount, setDonateAmount] = useState<string | undefined>();
  const [isVoteOpen, setIsVoteOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<{ address: `0x${string}`; name?: string } | null>(null);
  const [isStakeOpen, setIsStakeOpen] = useState(false);
  const [selectedScholar, setSelectedScholar] = useState<{ address: `0x${string}`; name?: string } | null>(null);
  const [isSelectWinnersOpen, setIsSelectWinnersOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);

  const { address: userAddress } = useAccount();
  const { toggle, isPending: isToggling } = useToggleOpenDonation();
  const { data: program, isLoading } = useProgram(id);
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });

  // Applicants are NOT lazy: the Apply button below has to know whether this
  // wallet already applied, which is decided before any tab is opened. Sharing
  // one query is free — TanStack Query keys on the program id, so the
  // applicants tab reuses this cache entry rather than refetching.
  const applicantsQ = useProgramApplicants(id);

  /** This wallet's own application, if any — drives the Apply button state. */
  const myApplication = userAddress
    ? (applicantsQ.data ?? []).find(
        (a) => a.wallet.toLowerCase() === userAddress.toLowerCase(),
      )
    : undefined;

  // Sub-resource queries (lazy loaded on tab switch)
  const scholarsQ = useProgramScholars(activeTab === 'scholars' ? id : '');
  const milestonesQ = useProgramMilestones(activeTab === 'milestones' ? id : '');
  const votesQ = useProgramVotes(activeTab === 'votes' || activeTab === 'applicants' ? id : '');
  const recsQ = useProgramRecommendations(activeTab === 'applicants' ? id : '');

  // Applicants best-first, so the rank shown is the rank the system will use.
  const rankedApplicants = [...(applicantsQ.data ?? [])].sort((x, y) => Number(y.totalScore ?? 0) - Number(x.totalScore ?? 0));
  const rankOf = new Map(rankedApplicants.map((a, i) => [a.wallet, i + 1]));
  const votePct = (wallet: string) => {
    let mine = 0n;
    let all = 0n;
    for (const v of votesQ.data ?? []) {
      const w = BigInt(v.votingWeight || '0');
      all += w;
      if (v.candidateAddress.toLowerCase() === wallet.toLowerCase()) mine += w;
    }
    return all > 0n ? Number((mine * 1000n) / all) / 10 : 0;
  };
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
          <h2 className="font-paytone text-3xl mb-3">{t('detail.notFound')}</h2>
          <p className="text-gray-600 mb-6">{t('detail.notFoundBody')}</p>
          <Link to="/programs">
            <NeoButton label={t('detail.back')} variant="secondary" size="md" />
          </Link>
        </div>
      </div>
    );
  }

  // Stages move by the clock, so the stored status can lag: a program whose application window
  // has ended is ready to be finalized even if it still reads APPLICATION_OPEN.
  const applicationsClosed = Date.now() >= (toDate(program.applicationEnd)?.getTime() ?? Infinity);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/programs" className="font-bold hover:text-skpurple transition-colors duration-75">
          {t('detail.programs')}
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

          {/* Creator only. This is a setting, not an action, so it is a switch, and it says what it changes. */}
          {userAddress === program.initiator && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={program.openDonation}
                disabled={isToggling}
                onClick={() => {
                  // Closing donations turns a public program into a private one, which is easy to do by accident.
                  if (program.openDonation && !window.confirm(t('detail.donationsConfirm'))) return;
                  toggle(BigInt(program.pid), !program.openDonation);
                }}
                className="inline-flex items-center gap-2.5 rounded-full border-2 border-black bg-white py-1.5 pl-2 pr-4 text-sm font-bold shadow-[2px_2px_0_0_#000] transition-all duration-75 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-40"
              >
                <span className={`relative h-6 w-11 rounded-full border-2 border-black transition-colors ${program.openDonation ? 'bg-skgreen-dark' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 size-4 rounded-full border-2 border-black bg-white transition-all ${program.openDonation ? 'left-[22px]' : 'left-0.5'}`} />
                </span>
                {program.openDonation ? t('detail.donationsOpen') : t('detail.donationsClosed')}
              </button>
              <span className="text-xs text-gray-500 max-w-md">
                {program.openDonation ? t('detail.donationsOpenHint') : t('detail.donationsClosedHint')}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {program.status === 'APPLICATION_OPEN' && (
            // Show the current application state instead of inviting a second
            // apply — the contract rejects a duplicate, so offering the button
            // would only produce a failed transaction.
            myApplication ? (
              <NeoButton
                label={t('detail.applied', { status: statusLabel(t, myApplication.status) })}
                variant="secondary"
                size="md"
                disabled
              />
            ) : (
              <Link to="/apply/$id" params={{ id: String(program.pid) }}>
                <NeoButton label={t('detail.apply')} variant="primary" size="md" />
              </Link>
            )
          )}
          {program.status === 'VOTING' && program.openDonation && (
            <NeoButton
              label={t('detail.castVote')}
              variant="primary"
              size="md"
              onClick={() => setActiveTab('applicants')}
            />
          )}
          {program.openDonation && !myApplication && (
            <NeoButton
              label={t('detail.donate')}
              variant="success"
              size="md"
              onClick={() => {
                setDonateAmount(undefined);
                setIsDonateOpen(true);
              }}
            />
          )}
          {(program.status === 'SCREENING' || (program.status === 'APPLICATION_OPEN' && applicationsClosed)) &&
            (program.openDonation || userAddress === program.initiator) && (
              <NeoButton
                label={t('panel.resolve')}
                variant="secondary"
                size="md"
                onClick={() => setIsResolveOpen(true)}
              />
            )}
          {program.status === 'VOTING' && (program.openDonation || userAddress === program.initiator) && (
            <NeoButton
              label={t('detail.selectWinners')}
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
          token={program.token as `0x${string}` | undefined}
          initialAmount={donateAmount}
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
          token={program.token as `0x${string}` | undefined}
        />
      )}

      {isSelectWinnersOpen && (
        <SelectWinnersModal isOpen onClose={() => setIsSelectWinnersOpen(false)} programId={program.pid} />
      )}

      {isResolveOpen && (
        <ResolveShortlistModal isOpen onClose={() => setIsResolveOpen(false)} programId={program.pid} />
      )}

      {/* An applicant of a self-scored program: who recommended them, and how to ask for more. */}
      {userAddress &&
        myApplication?.status === 'PENDING_REVIEW' &&
        program.screeningMode === 1 &&
        ['APPLICATION_OPEN', 'SCREENING'].includes(program.status) && (
          <MyRecommendationsCard programId={program.pid} student={userAddress} />
        )}

      <ProgramFundingCard
        program={program}
        donateBlockedReason={myApplication ? t('detail.applicantCannotDonate') : undefined}
        meta={meta ?? undefined}
        onDonate={(amount) => {
          setDonateAmount(amount);
          setIsDonateOpen(true);
        }}
      />

      {/* Phase timeline */}
      <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-5 md:p-6">
        <PhaseTimeline currentStatus={effectiveStatus(program)} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('detail.statTotal')} value={fmtAmount(program.totalFund, program.token)} color="green" />
        <StatCard label={t('detail.statSpent')} value={fmtAmount(program.spentFund, program.token)} color="orange" />
        <StatCard label={t('detail.statApplicants')} value={program.applicantCount} color="yellow" />
        <StatCard label={t('detail.statScholars')} value={program.activeScholarCount} color="purple" />
      </div>

      {/* Tabs — block style */}
      <div className="flex flex-wrap gap-1.5">
        {TAB_KEYS.map((tabKey) => {
          const tab = { key: tabKey, label: t(`detail.tab.${tabKey}` as const) };
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
            data={rankedApplicants}
            isLoading={applicantsQ.isLoading}
            renderItem={(a) => (
              <ApplicantRow
                key={a.wallet}
                applicant={a}
                rank={rankOf.get(a.wallet) ?? 0}
                isMe={!!userAddress && a.wallet.toLowerCase() === userAddress.toLowerCase()}
                recommendations={recsQ.data?.filter((r) => r.student.toLowerCase() === a.wallet.toLowerCase()) ?? []}
                votePct={votePct(a.wallet)}
                votingOpen={program.status === 'VOTING' && program.openDonation}
                onVote={() => {
                  setSelectedCandidate({ address: a.wallet as `0x${string}` });
                  setIsVoteOpen(true);
                }}
              />
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
                      {t('detail.received')} <span className="font-data font-bold">{fmtAmount(s.totalReceived, program.token)}</span> · {t('detail.milestone')} <span className="font-data">{s.currentMilestone}/{s.totalMilestones}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <NeoBadge status={s.status} />
                  {program.openDonation && s.status === 'ACTIVE' && (
                    <NeoButton
                      label={t('detail.back2')}
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
                  <p className="font-bold text-sm">{t('detail.milestoneNo')} <span className="font-data">#{m.blockchainId}</span></p>
                  <p className="text-[11px] text-gray-500 font-data mt-0.5">
                    {m.scholarWallet ? shortenAddress(m.scholarWallet) : '—'} · {fmtAmount(m.amount, m.token ?? program.token)}
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
                      <span className="text-gray-500">{t('detail.votedFor')}</span>{' '}
                      <span className="font-bold font-data text-skpurple">
                        {shortenAddress(v.candidateAddress)}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t('detail.weight')} <span className="font-data font-bold">{v.votingWeight}</span></p>
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
                    {t('detail.report')} <span className="font-data">#{d.blockchainId}</span>{' '}
                    <span className="text-[10px] font-extrabold font-data uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 border border-black">
                      {d.disputeType.replace(/_/g, ' ')}
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-500 font-data mt-0.5">
                    {t('detail.reporter')} {shortenAddress(d.bountyHunter)} <span className="text-gray-300">{t('detail.vs')}</span> {t('detail.scholar')} {shortenAddress(d.scholarAddress)}
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
  const { t } = useT();
  const fmtAmount = useFormatMoney();
  const grossTotal = BigInt(program.totalFund) + BigInt(program.protocolFeeCollected || 0);
  // Money stays in bigint. An 18-decimal amount exceeds Number's 2^53 exact
  // range, so subtracting as Number silently loses precision on native-token
  // programs. Only the percentages below narrow to Number, where a ratio of
  // two similar magnitudes is safe.
  const unallocated = BigInt(program.totalFund) - BigInt(program.allocatedFund);
  const pctSpent = (Number(program.spentFund) / Math.max(1, Number(program.totalFund))) * 100;
  const pctAllocated = ((Number(program.allocatedFund) - Number(program.spentFund)) / Math.max(1, Number(program.totalFund))) * 100;
  const pctUnallocated = (Number(unallocated) / Math.max(1, Number(program.totalFund))) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <NeoCard fill="cream" hoverable={false}>
        <NeoCardBody className="space-y-5">
          <h3 className="font-paytone text-lg">{t('detail.programDetails')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.maxCandidates')}</dt>
              <dd className="font-bold font-data text-base">{program.maxCandidates}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.targetWinners')}</dt>
              <dd className="font-bold font-data text-base">{program.targetWinners}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.scoring')}</dt>
              <dd className="font-bold">{program.screeningMode === 0 ? t('detail.byCommittee') : t('detail.byStudent')}</dd>
            </div>
            {program.openDonation && (
              <div className="flex justify-between items-baseline">
                <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.voteWeight')}</dt>
                <dd className="font-bold font-data">
                  {program.voteWeightBps != null ? `${program.voteWeightBps / 100}%` : t('detail.voteWeightDefault')}
                </dd>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.eduLevel')}</dt>
              <dd className="font-bold">{[t('create.edu.elementary'), t('create.edu.junior'), t('create.edu.senior'), t('create.edu.university')][program.educationLevel] ?? '—'}</dd>
            </div>
          </dl>
        </NeoCardBody>
      </NeoCard>

      <NeoCard fill="yellow" hoverable={false}>
        <NeoCardBody className="space-y-5">
          <h3 className="font-paytone text-lg">{t('detail.financial')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.gross')}</dt>
              <dd className="font-bold font-data">{fmtAmount(grossTotal, program.token)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-skpurple font-bold text-xs uppercase tracking-wider">{t('detail.net')}</dt>
              <dd className="font-bold text-skpurple font-data text-base">{fmtAmount(program.totalFund, program.token)}</dd>
            </div>
            <div className="flex justify-between items-baseline border-t-2 border-black/10 pt-2">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.allocated')}</dt>
              <dd className="font-bold font-data">{fmtAmount(program.allocatedFund, program.token)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.spent')}</dt>
              <dd className="font-bold text-orange-600 font-data">{fmtAmount(program.spentFund, program.token)}</dd>
            </div>
            <div className="flex justify-between items-baseline">
              <dt className="text-gray-500 text-xs uppercase tracking-wider font-bold">{t('detail.earnings')}</dt>
              <dd className="font-bold text-skpurple font-data">{fmtAmount(program.yieldAccrued, program.token)}</dd>
            </div>
          </dl>

          {/* Allocation Breakdown Bar */}
          <div className="pt-1">
            <h4 className="font-bold text-[10px] uppercase text-gray-500 tracking-widest mb-2">{t('detail.allocation')}</h4>
            <div className="flex h-5 w-full bg-white border-2 border-black overflow-hidden">
              <div
                className="h-full bg-skgreen border-r-2 border-black"
                style={{ width: `${pctSpent}%` }}
                title={`${t('detail.spent')}: ${fmtAmount(program.spentFund, program.token)}`}
              />
              <div
                className="h-full bg-skyellow border-r-2 border-black"
                style={{ width: `${pctAllocated}%` }}
                title={`${t('detail.pending')}: ${fmtAmount(BigInt(program.allocatedFund) - BigInt(program.spentFund), program.token)}`}
              />
              <div
                className="h-full bg-gray-200"
                style={{ width: `${pctUnallocated}%` }}
                title={`${t('detail.unallocated')}: ${fmtAmount(unallocated, program.token)}`}
              />
            </div>
            <div className="flex justify-between text-[10px] font-bold text-gray-600 mt-1.5 uppercase tracking-wider">
              <span className="text-green-700">{t('detail.spent')} {pctSpent.toFixed(0)}%</span>
              <span className="text-yellow-700">{t('detail.pending')} {pctAllocated.toFixed(0)}%</span>
              <span>{t('detail.unallocated')} {pctUnallocated.toFixed(0)}%</span>
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
  const { t } = useT();
  if (isLoading) return <NeoSkeleton lines={5} className="py-4" />;
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-10 text-center">
        <p className="font-paytone text-lg mb-1">{t('detail.emptyTitle')}</p>
        <p className="text-gray-500 text-sm">{t('detail.emptyBody')}</p>
      </div>
    );
  }
  return (
    <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg overflow-hidden">
      <div className="divide-y-2 divide-gray-100">{data.map(renderItem)}</div>
    </div>
  );
}
