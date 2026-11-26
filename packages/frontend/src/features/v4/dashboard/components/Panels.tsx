import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProgramMeta } from '@/lib/ipfs';
import { formatTokenAmount } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { useFormatMoney } from '@/lib/money';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { WalletAvatar } from '@/components/ui/WalletAvatar';
import type { TranslationKey } from '@/lib/i18n/en';
import {
  useOpenApplications,
  useCancelProgram,
  useApplicationExtensionCount,
  useClaimYield,
  useSubmitMilestone,
  useExecuteMilestone,
  useTriggerAutoGuilty,
  useVoteOnDispute,
  useResolveDisputeAsCreator,
  useVoteOnMilestone,
} from '@/lib/contracts/write-hooks';
import type {
  DashboardData,
  Program,
  Scholar,
  Dispute,
  Milestone,
  Applicant,
} from '@/lib/api/types';
import { useProgramApplicants, useProgramMilestones, useExternalProgress } from '@/lib/api/hooks';

import { CommitteeManagementModal } from '../../programs/components/CommitteeManagementModal';
import { ResolveShortlistModal } from '../../programs/components/ResolveShortlistModal';
import { SelectWinnersModal } from '../../programs/components/SelectWinnersModal';
import { ProgramSettingsModal } from '../../programs/components/ProgramSettingsModal';
import { toEpochSec } from '@/lib/time';
import { ProposeMilestoneModal } from './ProposeMilestoneModal';
import { CommitteeScoreModal } from './CommitteeScoreModal';
import { StakeClaimButton } from './StakeClaimButton';
import { EvidenceView } from '@/components/ui/EvidenceView';
import { useProgramLabel } from '@/lib/api/useProgramLabel';
import { useVotingClock } from '@/features/v4/vote/useVotingClock';
import { DefendModal } from '../../report/components/DefendModal';
import { SubmitMilestoneModal } from './SubmitMilestoneModal';
import { displayStatus, reopenLimit, MAX_EXTENSIONS } from '@/lib/programStatus';
import { ExtendDeadlineModal } from './ExtendDeadlineModal';

// ─────────────────────────────────────────────────────────────────────────────
// Initiator Panel
// ─────────────────────────────────────────────────────────────────────────────

export function InitiatorPanel({
  programs,
  onOpenCreateModal,
  hideHeading = false,
}: {
  programs: Program[];
  onOpenCreateModal: () => void;
  /** The surrounding tab already names this section. */
  hideHeading?: boolean;
}) {
  const { t } = useT();
  const [manageCommitteeFor, setManageCommitteeFor] = useState<number | null>(null);
  const [resolveShortlistFor, setResolveShortlistFor] = useState<number | null>(null);
  const [selectWinnersFor, setSelectWinnersFor] = useState<number | null>(null);
  const [settingsFor, setSettingsFor] = useState<number | null>(null);

  return (
    <section className="w-full">
      {!hideHeading && (
        <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skpink pl-4 leading-none">
          {t('panel.initiated')}
        </h2>
      )}
      <div className={`grid grid-cols-1 gap-4 ${programs.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {programs.length === 0 ? (
          <NeoCard hoverable={false} className="bg-skpink-light/30 border-dashed col-span-2">
            <NeoCardBody className="py-12 text-center">
              <h3 className="font-paytone text-2xl mb-2 text-skpink-dark">{t('panel.launchTitle')}</h3>
              <p className="text-gray-600 mb-6 max-w-sm mx-auto">{t('panel.launchBody')}</p>
              <NeoButton label={t('panel.createProgram')} variant="primary" size="lg" onClick={onOpenCreateModal} />
            </NeoCardBody>
          </NeoCard>
        ) : (
          programs.map((p) => (
            <InitiatorProgramCard
              key={p.pid}
              program={p}
              onManageCommittee={() => setManageCommitteeFor(p.pid)}
              onResolveShortlist={() => setResolveShortlistFor(p.pid)}
              onSelectWinners={() => setSelectWinnersFor(p.pid)}
              onSettings={() => setSettingsFor(p.pid)}
            />
          ))
        )}
      </div>

      {manageCommitteeFor !== null && (
        <CommitteeManagementModal
          isOpen
          onClose={() => setManageCommitteeFor(null)}
          programId={manageCommitteeFor}
        />
      )}

      {resolveShortlistFor !== null && (
        <ResolveShortlistModal isOpen onClose={() => setResolveShortlistFor(null)} programId={resolveShortlistFor} />
      )}

      {selectWinnersFor !== null && (
        <SelectWinnersModal isOpen onClose={() => setSelectWinnersFor(null)} programId={selectWinnersFor} />
      )}

      {settingsFor !== null && (
        <ProgramSettingsModal isOpen onClose={() => setSettingsFor(null)} programId={settingsFor} />
      )}
    </section>
  );
}

function InitiatorProgramCard({
  program,
  onManageCommittee,
  onResolveShortlist,
  onSelectWinners,
  onSettings,
}: {
  program: Program;
  onManageCommittee: () => void;
  onResolveShortlist: () => void;
  onSelectWinners: () => void;
  onSettings: () => void;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { openApplications, isPending: openingApps } = useOpenApplications();
  const { cancelProgram, isPending: cancelling } = useCancelProgram();
  const { claimYield, isPending: claiming } = useClaimYield();

  const [isExtending, setIsExtending] = useState(false);

  // Same query key as everywhere else a program name is shown, so this is shared.
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  const isFinal = ['COMPLETED', 'CANCELLED'].includes(program.status);
  // Applications closed with nobody applying: only reopening (if still allowed) or cancelling helps.
  const shownStatus = displayStatus(program);
  const expired = shownStatus === 'EXPIRED';
  const extensions = useApplicationExtensionCount(program.pid, expired);
  const canReopen = expired && reopenLimit(program) !== null && extensions !== undefined && extensions < MAX_EXTENSIONS;
  // Stages move by the clock now: these only decide whether a button has anything to do yet.
  const nowSec = Math.floor(Date.now() / 1000);
  const startReached = nowSec >= (toEpochSec(program.applicationStart) ?? Infinity);
  const applicationsClosed = nowSec >= (toEpochSec(program.applicationEnd) ?? Infinity);
  const votingEnded = nowSec >= (toEpochSec(program.votingEnd) ?? Infinity);
  const canConfigure = ['CREATED', 'APPLICATION_OPEN', 'SCREENING'].includes(program.status);
  const canClaim = program.status === 'COMPLETED' && BigInt(program.yieldAccrued) > 0n;
  const nextHintKey = (expired && !canReopen ? 'panel.next.EXPIRED_FINAL' : `panel.next.${shownStatus}`) as TranslationKey;

  return (
    <div className="w-full rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#000] p-5 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-data text-sm font-black text-gray-400">#{program.pid}</span>
            <NeoBadge status={shownStatus} />
            {!program.openDonation && (
              <span className="bg-black text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider">
                {t('panel.private')}
              </span>
            )}
          </div>
          <h3 className="font-paytone text-2xl leading-tight [overflow-wrap:anywhere]">
            {meta?.name ?? t('panel.program', { id: program.pid })}
          </h3>
        </div>
        <Link to="/programs/$id" params={{ id: String(program.pid) }}>
          <NeoButton label={t('panel.view')} variant="secondary" size="sm" className="!rounded-xl" />
        </Link>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border-2 border-black bg-skpurple-light p-3 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.fund')}</p>
          <p className="font-paytone text-xl mt-1 [overflow-wrap:anywhere]">{fmt(program.totalFund, program.token)}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-skgreen p-3 col-span-2 lg:col-span-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.earnings')}</p>
          <p className="font-paytone text-xl mt-1 text-emerald-800 [overflow-wrap:anywhere]">{fmt(program.yieldAccrued, program.token)}</p>
        </div>
        <div className="rounded-xl border-2 border-black bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.applicants')}</p>
          <p className="font-paytone text-xl mt-1">
            {program.applicantCount}
            <span className="ml-1.5 text-xs font-bold text-gray-400 font-data">
              {program.shortlistedCount} {t('panel.shortlisted')}
            </span>
          </p>
        </div>
        <div className="rounded-xl border-2 border-black bg-white p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.scholars')}</p>
          <p className="font-paytone text-xl mt-1">{program.activeScholarCount}</p>
        </div>
      </div>

      {/* What to do next — the single primary action for this stage */}
      <div className="rounded-xl border-2 border-black bg-skyellow-light p-4 space-y-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.nextStep')}</p>
          <p className="text-sm font-bold mt-0.5">{t(nextHintKey)}</p>
          {program.openDonation && (
            <p className="text-xs text-gray-600 mt-1 font-data">
              {t('settings.current', {
                votes: (program.voteWeightBps ?? 3000) / 100,
                count: program.milestonePlanCount ?? 1,
              })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {program.status === 'CREATED' && !expired && (
            <NeoButton
              label={openingApps ? t('panel.opening') : t('panel.openApps')}
              variant="primary"
              className="!rounded-xl"
              loading={openingApps}
              disabled={openingApps || !startReached}
              onClick={() => openApplications(BigInt(program.pid))}
            />
          )}

          {(program.status === 'APPLICATION_OPEN' || program.status === 'SCREENING') && !expired && (
            <NeoButton
              label={t('panel.resolve')}
              variant="primary"
              className="!rounded-xl"
              disabled={!applicationsClosed}
              onClick={onResolveShortlist}
            />
          )}

          {program.status === 'VOTING' && (
            <NeoButton
              label={t('panel.selectWinners')}
              variant="success"
              className="!rounded-xl"
              disabled={program.openDonation && !votingEnded}
              onClick={onSelectWinners}
            />
          )}

          {canClaim && (
            <NeoButton
              label={claiming ? t('panel.claiming') : t('panel.claimEarnings')}
              variant="success"
              className="!rounded-xl"
              loading={claiming}
              disabled={claiming}
              onClick={() => claimYield(BigInt(program.pid), '0x0000000000000000000000000000000000000000')}
            />
          )}

          {(program.status === 'APPLICATION_OPEN' || program.status === 'VOTING') && !expired && (
            <NeoButton label={t('panel.extend')} variant="secondary" className="!rounded-xl" onClick={() => setIsExtending(true)} />
          )}

          {canReopen && (
            <NeoButton label={t('panel.reopen')} variant="primary" className="!rounded-xl" onClick={() => setIsExtending(true)} />
          )}

          {canConfigure && !expired && (
            <NeoButton label={t('settings.open')} variant="secondary" className="!rounded-xl" onClick={onSettings} />
          )}

          {!isFinal && !expired && (
            <NeoButton label={t('panel.manageCommittee')} variant="secondary" className="!rounded-xl" onClick={onManageCommittee} />
          )}
        </div>
      </div>

      {/* Destructive action kept apart from the routine ones */}
      {!isFinal && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-black/10 pt-4">
          <p className="text-xs text-gray-500 font-medium">{t(expired ? 'panel.dangerHintExpired' : 'panel.dangerHint')}</p>
          <NeoButton
            label={cancelling ? t('panel.cancelling') : t(expired ? 'panel.cancelRefund' : 'panel.cancel')}
            variant="danger"
            size="sm"
            className="!rounded-xl"
            loading={cancelling}
            disabled={cancelling}
            onClick={() => {
              // Irreversible — make it a deliberate click.
              if (window.confirm(t('panel.cancelConfirm'))) cancelProgram(BigInt(program.pid));
            }}
          />
        </div>
      )}

      {isExtending && (
        <ExtendDeadlineModal
          isOpen
          onClose={() => setIsExtending(false)}
          program={program}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Student Panel
// ─────────────────────────────────────────────────────────────────────────────

export function StudentPanel({
  scholarships,
  dashboardData,
}: {
  scholarships: Array<{ scholar: Scholar; program: Partial<Program> | null }>;
  dashboardData: DashboardData;
}) {
  const { t } = useT();
  const [proposeMilestoneFor, setProposeMilestoneFor] = useState<number | null>(null);

  return (
    <section>
      <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skblue pl-4 leading-none">
        {t('panel.myScholarships')}
      </h2>
      <div className="space-y-4">
        {scholarships.length === 0 ? (
          <NeoCard hoverable={false} className="bg-skblue-light/30 border-dashed">
            <NeoCardBody className="py-10 text-center">
              <p className="font-bold text-lg mb-1">{t('panel.noScholarships')}</p>
              <p className="text-sm text-gray-500 mb-4">{t('panel.noScholarshipsBody')}</p>
              <Link to="/programs">
                <NeoButton label={t('panel.browse')} variant="primary" size="sm" />
              </Link>
            </NeoCardBody>
          </NeoCard>
        ) : (
          scholarships.map(({ scholar }) => {
            const myMilestones = dashboardData.milestones.filter(
              (m) => m.pid === scholar.pid && m.scholarWallet === scholar.wallet
            );
            return (
              <ScholarCard
                key={`${scholar.pid}-${scholar.wallet}`}
                scholar={scholar}
                milestones={myMilestones}
                onProposeMilestone={() => setProposeMilestoneFor(scholar.pid)}
              />
            );
          })
        )}
      </div>

      {proposeMilestoneFor !== null && (
        <ProposeMilestoneModal
          isOpen
          onClose={() => setProposeMilestoneFor(null)}
          programId={proposeMilestoneFor}
        />
      )}
    </section>
  );
}

function ScholarCard({
  scholar,
  milestones,
  onProposeMilestone,
}: {
  scholar: Scholar;
  milestones: Milestone[];
  onProposeMilestone: () => void;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { submitMilestone, isPending: isSubmitting } = useSubmitMilestone();
  const { executeMilestone, isPending: isExecuting } = useExecuteMilestone();

  const [submitMilestoneFor, setSubmitMilestoneFor] = useState<Milestone | null>(null);

  const nextPending = milestones.find((m) => m.status === 'PENDING');
  const executables = milestones.filter(
    (m) =>
      m.status === 'SUBMITTED' &&
      m.disputeDeadline &&
      new Date(m.disputeDeadline).getTime() < Date.now(),
  );

  // External Progress Hook - Now dynamic from on-chain data
  const { data: externalProg, refetch: syncProgress, isFetching: syncing } = useExternalProgress(
    scholar.wallet,
    nextPending?.provider ?? undefined,
    nextPending?.externalId ?? undefined
  );

  const progItem = Array.isArray(externalProg) ? externalProg[0] : externalProg;
  const isVerified = (progItem?.progress ?? 0) >= 100 || progItem?.status === 'COMPLETED';
  const providerLabel = nextPending?.provider === 'hackquest' ? 'HackQuest' : nextPending?.provider === 'udemy' ? 'Udemy' : nextPending?.provider;

  return (
    <NeoCard>
      <NeoCardBody className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex-1">
            <h3 className="font-bold text-lg">{t('panel.program', { id: scholar.pid })}</h3>
            <p className="text-xs text-gray-500 mb-2">
              {t('panel.statusLabel')} <span className="font-bold text-black">{statusLabel(t, scholar.status)}</span>
            </p>
            <div className="bg-gray-100 p-2 rounded border border-black">
              <div className="flex justify-between text-xs mb-1">
                <span>{t('panel.progress')}</span>
                <span>
                  {scholar.currentMilestone} / {scholar.totalMilestones}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 border-2 border-black overflow-hidden">
                <div
                  className="h-full bg-skpurple transition-all"
                  style={{
                    width: `${(scholar.currentMilestone / Math.max(1, scholar.totalMilestones)) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 w-full xl:w-52">
            {scholar.status === 'FROZEN' ? (
              <div className="bg-red-100 p-2 border-2 border-red-500 rounded text-red-700 text-sm font-bold text-center">
                {t('panel.frozenUntil', { date: scholar.freezeUntil ? new Date(scholar.freezeUntil).toLocaleDateString() : '—' })}
              </div>
            ) : nextPending ? (
              <div className="flex flex-col gap-2">
                {(nextPending.revisionCount ?? 0) > 0 && nextPending.revisionReasonCID && (
                  <div className="rounded-xl border-2 border-black bg-skred-light p-3 text-sm space-y-1">
                    <p className="font-bold text-skred">{t('pm.fixRequested', { n: nextPending.revisionCount ?? 0 })}</p>
                    <EvidenceView cid={nextPending.revisionReasonCID} />
                  </div>
                )}
                {nextPending.provider && (
                  <NeoButton
                    label={syncing ? t('panel.syncing') : t('panel.syncWith', { provider: providerLabel ?? '' })}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => syncProgress()}
                    loading={syncing}
                  />
                )}

                {isVerified ? (
                  <NeoButton
                    label={isSubmitting ? t('panel.verifying') : t('panel.claimMilestone', { id: nextPending.blockchainId })}
                    variant="success"
                    fullWidth
                    loading={isSubmitting}
                    disabled={isSubmitting}
                    onClick={() => submitMilestone(BigInt(nextPending.blockchainId), `AUTO_VERIFIED_VIA_${nextPending.provider?.toUpperCase()}`)}
                  />
                ) : (
                  nextPending.kind === 'MANDATORY' && !nextPending.requiresProof ? (
                    // Opens the same dialog as a proof submission, so the scholar sees what the
                    // milestone is worth and what happens next before anything is sent.
                    <NeoButton
                      label={
                        isSubmitting ? t('panel.triggering') : t('panel.triggerDelivery', { id: nextPending.blockchainId })
                      }
                      variant="primary"
                      fullWidth
                      loading={isSubmitting}
                      disabled={isSubmitting}
                      onClick={() => setSubmitMilestoneFor(nextPending)}
                    />
                  ) : (
                    <NeoButton
                      label={t('panel.submitProof', { id: nextPending.blockchainId })}
                      variant="primary"
                      fullWidth
                      onClick={() => setSubmitMilestoneFor(nextPending)}
                    />
                  )
                )}
              </div>
            ) : (
              <NeoButton label={t('panel.allDone')} variant="ghost" disabled fullWidth />
            )}

            {executables.map((m) => (
              <NeoButton
                key={m.blockchainId}
                label={isExecuting ? t('panel.executing') : t('panel.release', { id: m.blockchainId })}
                variant="success"
                size="sm"
                fullWidth
                loading={isExecuting}
                disabled={isExecuting}
                onClick={() => executeMilestone(BigInt(m.blockchainId))}
              />
            ))}

            {scholar.status === 'ACTIVE' && (
              <NeoButton
                label={t('panel.propose')}
                variant="ghost"
                size="sm"
                fullWidth
                onClick={onProposeMilestone}
              />
            )}
          </div>
        </div>

        {milestones.length > 0 && (
          <div className="border-t-2 border-gray-100 pt-3">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">{t('panel.milestones')}</p>
            <div className="space-y-1">
              {milestones.map((m) => (
                <div
                  key={m.blockchainId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white px-3 py-2.5 border-2 border-black shadow-[2px_2px_0_0_#000]">
                  <div>
                    <span className="font-bold">#{m.blockchainId}</span>
                    <span className="ml-2 text-xs font-bold uppercase px-1.5 py-0.5 rounded-sm bg-gray-200 text-gray-700">
                      {statusLabel(t, m.kind)}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {fmt(m.amount, m.token)}
                    </span>
                  </div>
                  <StatusPill status={m.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </NeoCardBody>

      {submitMilestoneFor !== null && (
        <SubmitMilestoneModal
          isOpen
          onClose={() => setSubmitMilestoneFor(null)}
          milestone={submitMilestoneFor}
        />
      )}
    </NeoCard>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useT();
  const colors: Record<string, string> = {
    PENDING: 'bg-skyellow text-black',
    SUBMITTED: 'bg-skpurple text-white',
    COMPLETED: 'bg-skgreen text-black',
    FROZEN: 'bg-skred text-white',
    DISPUTED: 'bg-skorange text-black',
    PROPOSED: 'bg-skpurple-light text-black',
    REJECTED: 'bg-gray-300 text-black',
  };
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border-2 border-black ${
        colors[status] ?? 'bg-gray-100 text-black'
      }`}>
      {statusLabel(t, status)}
    </span>
  );
}

/** A short, honest empty state: what this is, and where to start. Replaces the tall dashed hero boxes. */
function CompactEmpty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-paytone text-lg leading-tight">{title}</p>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">{body}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Voter Panel
// ─────────────────────────────────────────────────────────────────────────────

export function VoterPanel({
  votes,
  stakes,
  bare = false,
}: {
  votes: DashboardData['votes'];
  stakes: DashboardData['stakes'];
  dashboardData: DashboardData;
  /** Inside a tab: no heading of its own. */
  bare?: boolean;
}) {
  const { t } = useT();
  return (
    <section>
      {!bare && (
        <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skpurple pl-4 leading-none">
          {t('panel.voterActivity')}
        </h2>
      )}

      {votes.length === 0 && stakes.length === 0 ? (
        <CompactEmpty
          title={t('panel.shapeTitle')}
          body={t('panel.shapeBody')}
          action={
            <Link to="/vote">
              <NeoButton label={t('panel.discover')} variant="primary" size="md" className="!rounded-xl" />
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-paytone text-lg">{t('panel.castVotes', { n: votes.length })}</h3>
            {votes.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-black/40 bg-white/60 p-4 text-sm text-gray-600">{t('panel.noVotes')}</p>
            ) : (
              votes.map((v) => <VoteCard key={`${v.pid}-${v.voterAddress}`} vote={v} />)
            )}
          </div>
          <div className="space-y-3">
            <h3 className="font-paytone text-lg">{t('panel.backings', { n: stakes.length })}</h3>
            {stakes.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-black/40 bg-white/60 p-4 text-sm text-gray-600">{t('panel.noBackings')}</p>
            ) : (
              stakes.map((s) => <BackingCard key={`${s.pid}-${s.voterAddress}`} stake={s} />)
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : '');

/** One vote: who it went to, how much it was worth, in which program and what state that program is in. */
function VoteCard({ vote }: { vote: DashboardData['votes'][number] }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { program, name } = useProgramLabel(vote.pid);
  return (
    <div className="rounded-2xl border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#000]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="text-[11px] text-gray-500">{t('panel.progShort', { id: vote.pid })} · {when(vote.createdAt)}</p>
        </div>
        {program && <NeoBadge status={program.status} />}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <WalletAvatar address={vote.candidateAddress} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('vote.sumCandidate')}</p>
          <p className="font-data text-sm font-bold">{shortAddr(vote.candidateAddress)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('board.myVote')}</p>
          <p className="font-data text-sm font-bold">{fmt(vote.votingWeight, program?.token)}</p>
        </div>
      </div>
      <Link to="/programs/$id" params={{ id: String(vote.pid) }} className="mt-3 inline-block text-xs font-bold underline">
        {t('panel.openProgram')}
      </Link>
    </div>
  );
}

/** One backing deposit: how much, for whom, what it returns in each outcome, and where it stands. */
function BackingCard({ stake }: { stake: DashboardData['stakes'][number] }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { program, name } = useProgramLabel(stake.pid);
  const state = !stake.isResolved
    ? { label: t('panel.stakePending'), tone: 'bg-skyellow' }
    : stake.wasSlashed
      ? { label: t('panel.stakeSlashed'), tone: 'bg-skred text-white' }
      : { label: t('panel.stakeReturned'), tone: 'bg-skgreen' };
  return (
    <div className="rounded-2xl border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#000]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="text-[11px] text-gray-500">{t('panel.progShort', { id: stake.pid })} · {when(stake.createdAt)}</p>
        </div>
        <span className={`rounded border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase ${state.tone}`}>{state.label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <WalletAvatar address={stake.scholarAddress} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.backedScholar')}</p>
          <p className="font-data text-sm font-bold">{shortAddr(stake.scholarAddress)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('panel.stakeDeposit')}</p>
          <p className="font-data text-sm font-bold">{fmt(stake.amount, program?.token ?? stake.token)}</p>
        </div>
      </div>
      {stake.isResolved ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t-2 border-black/10 pt-2 text-xs">
          <div><dt className="text-gray-500">{t('panel.stakeBack')}</dt><dd className="font-data font-bold">{fmt(stake.returnedAmount, stake.token)}</dd></div>
          <div><dt className="text-gray-500">{t('panel.stakeBonus')}</dt><dd className="font-data font-bold">{fmt(stake.bonusAmount, stake.token)}</dd></div>
        </dl>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2 border-t-2 border-black/10 pt-2">
          <p className="text-xs text-gray-600">{t('panel.stakeWaiting')}</p>
          <StakeClaimButton pid={stake.pid} voter={stake.voterAddress} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounty Hunter Panel
// ─────────────────────────────────────────────────────────────────────────────

export function BountyHunterPanel({
  disputes,
  bare = false,
  hasProgramReports = false,
}: {
  disputes: DashboardData['disputes'];
  bare?: boolean;
  /** This wallet runs or sits on a program that has reports (they are in the Reports tab above). */
  hasProgramReports?: boolean;
}) {
  const { t } = useT();
  const { rate } = useTokenRate();

  const wonCount = disputes.filter(d => d.status.includes('WON') || d.status.includes('GUILTY') || d.status.includes('CONCEDED')).length;
  const lostCount = disputes.filter(d => d.status.includes('LOST') || d.status.includes('REJECTED')).length;
  const activeCount = disputes.filter(d => d.status === 'ACTIVE').length;
  const totalReward = disputes.reduce((acc, obj) => acc + Number(formatTokenAmount(obj.bhRewardPaid || "0", obj.token)), 0);

  return (
    <section>
      {!bare && (
        <div className="flex justify-between items-end mb-4">
          <h2 className="font-paytone text-3xl border-l-8 border-skgreen pl-4 leading-none">
            {t('panel.reporterActivity')}
          </h2>
          <Link to="/report" search={{ new: true }}>
            <NeoButton label={t('panel.raise')} variant="danger" size="sm" />
          </Link>
        </div>
      )}

      {disputes.length === 0 ? (
        <div className="space-y-3">
          <CompactEmpty
            title={t('panel.guardTitle')}
            body={`${t('panel.guardBody')} ${t('panel.guardRule')}`}
            action={
              <Link to="/report" search={{ new: true }}>
                <NeoButton label={t('panel.startReporting')} variant="danger" size="md" className="!rounded-xl" />
              </Link>
            }
          />
          {hasProgramReports && (
            <p className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">{t('panel.reportsAbove')}</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <NeoCard hoverable={false} className="bg-skgreen-light">
              <NeoCardBody className="p-3 text-center">
                <p className="text-xs text-gray-500 font-bold uppercase">{t('panel.won')}</p>
                <p className="font-paytone text-2xl text-skgreen">{wonCount}</p>
              </NeoCardBody>
            </NeoCard>
            <NeoCard hoverable={false} className="bg-skred-light">
              <NeoCardBody className="p-3 text-center">
                <p className="text-xs text-gray-500 font-bold uppercase">{t('panel.lost')}</p>
                <p className="font-paytone text-2xl text-skred">{lostCount}</p>
              </NeoCardBody>
            </NeoCard>
            <NeoCard hoverable={false} className="bg-skyellow-light">
              <NeoCardBody className="p-3 text-center">
                <p className="text-xs text-gray-500 font-bold uppercase">{t('panel.active')}</p>
                <p className="font-paytone text-2xl text-skyellow-dark">{activeCount}</p>
              </NeoCardBody>
            </NeoCard>
            <NeoCard hoverable={false}>
              <NeoCardBody className="p-3 text-center">
                <p className="text-xs text-gray-500 font-bold uppercase">{t('panel.totalRewards')}</p>
                <p className="font-paytone text-2xl">{rate ? formatToIDR(usdcToIdr(totalReward, rate)) : `${totalReward.toFixed(2)} USDC`}</p>
              </NeoCardBody>
            </NeoCard>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {disputes.map((d) => (
              <BountyDisputeCard key={d.blockchainId} dispute={d} />
            ))}
          </div>
        </>
      )}

    </section>
  );
}

function BountyDisputeCard({ dispute }: { dispute: Dispute }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { triggerAutoGuilty, isPending: triggering } = useTriggerAutoGuilty();
  const { program, name } = useProgramLabel(dispute.pid ?? 0);
  const clock = useVotingClock(dispute.defenseDeadline);

  const active = dispute.status === 'ACTIVE';
  const won = dispute.status.includes('WON') || dispute.status.includes('GUILTY') || dispute.status.includes('CONCEDED');
  const defended = !!dispute.counterEvidenceCID;
  const windowClosed = dispute.defenseDeadline !== null && clock.ended;
  const canAutoGuilty = active && windowClosed && !defended;

  // Where the report stands: reported -> the scholar answers -> the committee rules.
  const answer = defended
    ? { text: t('panel.stepAnswered'), tone: 'bg-skgreen' }
    : windowClosed
      ? { text: t('panel.stepNoAnswer'), tone: 'bg-skred text-white' }
      : { text: clock.text ? t('panel.stepWaitingLeft', { left: clock.text }) : t('panel.stepWaiting'), tone: 'bg-skyellow' };
  const ruling = active
    ? { text: defended ? t('panel.stepCommittee') : windowClosed ? t('panel.stepAuto') : t('panel.stepAfterAnswer'), tone: 'bg-gray-100' }
    : won
      ? { text: t('panel.stepUpheld'), tone: 'bg-skgreen' }
      : { text: t('panel.stepRejected'), tone: 'bg-skred text-white' };

  return (
    <div className="rounded-2xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000] space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="text-[11px] text-gray-500">
            {t('panel.report', { id: dispute.blockchainId })} · {dispute.raisedAt ? new Date(dispute.raisedAt).toLocaleDateString() : ''}
            {program ? ` · ${statusLabel(t, program.status)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
            {statusLabel(t, dispute.disputeType)}
          </span>
          <span className={`rounded border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase ${active ? 'bg-skyellow' : won ? 'bg-skgreen' : 'bg-skred text-white'}`}>
            {statusLabel(t, dispute.status)}
          </span>
        </div>
      </div>

      {/* Who is accused */}
      <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-skyellow-light p-2.5">
        <WalletAvatar address={dispute.scholarAddress} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('progReports.accused')}</p>
          <p className="font-data text-sm font-bold">{shortAddr(dispute.scholarAddress)}</p>
        </div>
        {dispute.milestoneId !== null && (
          <span className="rounded border-2 border-black bg-white px-2 py-0.5 text-[10px] font-extrabold uppercase">
            {t('progReports.milestone')} #{dispute.milestoneId}
          </span>
        )}
      </div>

      {/* The money */}
      <dl className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border-2 border-black bg-white p-2">
          <dt className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{t('panel.stakePaid')}</dt>
          <dd className="mt-0.5 font-data text-sm font-bold">{fmt(dispute.stake, dispute.token)}</dd>
        </div>
        <div className="rounded-xl border-2 border-black bg-white p-2">
          <dt className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{t('panel.potentialReward')}</dt>
          <dd className="mt-0.5 font-data text-sm font-bold">{fmt(dispute.potentialReward, dispute.token)}</dd>
        </div>
        <div className={`rounded-xl border-2 border-black p-2 ${won ? 'bg-skgreen' : 'bg-white'}`}>
          <dt className="text-[10px] font-extrabold uppercase tracking-wider text-gray-600">{t('panel.rewardPaid')}</dt>
          <dd className="mt-0.5 font-data text-sm font-bold">{fmt(dispute.bhRewardPaid, dispute.token)}</dd>
        </div>
      </dl>

      {/* Progress of the report */}
      <ol className="space-y-1.5 text-xs">
        <li className="flex items-center gap-2"><span className="w-5 h-5 shrink-0 rounded-full border-2 border-black bg-skgreen text-center text-[10px] leading-4 font-bold">1</span><span className="font-bold">{t('panel.stepReported')}</span></li>
        <li className="flex items-center gap-2"><span className={`w-5 h-5 shrink-0 rounded-full border-2 border-black text-center text-[10px] leading-4 font-bold ${answer.tone}`}>2</span><span>{answer.text}</span></li>
        <li className="flex items-center gap-2"><span className={`w-5 h-5 shrink-0 rounded-full border-2 border-black text-center text-[10px] leading-4 font-bold ${ruling.tone}`}>3</span><span>{ruling.text}</span></li>
      </ol>

      {/* What was submitted */}
      <details className="rounded-xl border-2 border-black bg-white p-2.5 text-sm">
        <summary className="cursor-pointer font-bold">{t('progReports.evidence')}</summary>
        <div className="mt-2"><EvidenceView cid={dispute.evidenceCID} /></div>
        {defended && (
          <div className="mt-3 border-t-2 border-black/10 pt-2">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('progReports.defence')}</p>
            <EvidenceView cid={dispute.counterEvidenceCID} />
          </div>
        )}
      </details>

      {active && <p className="text-xs text-gray-600">{t('panel.stakeRule')}</p>}
      {!active && (
        <p className="rounded-xl border-2 border-black bg-white p-2.5 text-xs">{won ? t('panel.outcomeWon') : t('panel.outcomeLost')}</p>
      )}

      {canAutoGuilty && (
        <NeoButton
          label={triggering ? t('panel.triggering') : t('panel.autoGuilty')}
          variant="danger"
          size="sm"
          fullWidth
          loading={triggering}
          disabled={triggering}
          onClick={() => triggerAutoGuilty(BigInt(dispute.blockchainId))}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports against this wallet (where the accused scholar defends)
// ─────────────────────────────────────────────────────────────────────────────

export function AgainstMePanel({ disputes }: { disputes: DashboardData['disputes'] }) {
  const { t } = useT();
  const [defending, setDefending] = useState<Dispute | null>(null);
  const needs = disputes.filter((d) => d.status === 'ACTIVE' && !d.counterEvidenceCID);

  if (disputes.length === 0) {
    return <CompactEmpty title={t('panel.againstEmptyTitle')} body={t('panel.againstEmptyBody')} />;
  }
  return (
    <section className="space-y-4">
      {needs.length > 0 && (
        <p className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm font-bold">{t('panel.againstNeeds', { n: needs.length })}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {disputes.map((d) => (
          <AgainstCard key={d.blockchainId} dispute={d} onDefend={() => setDefending(d)} />
        ))}
      </div>
      {defending && <DefendModal isOpen onClose={() => setDefending(null)} dispute={defending} />}
    </section>
  );
}

function AgainstCard({ dispute, onDefend }: { dispute: Dispute; onDefend: () => void }) {
  const { t } = useT();
  const { name } = useProgramLabel(dispute.pid ?? 0);
  const clock = useVotingClock(dispute.defenseDeadline);
  const active = dispute.status === 'ACTIVE';
  const defended = !!dispute.counterEvidenceCID;
  const windowClosed = dispute.defenseDeadline !== null && clock.ended;
  const canDefend = active && !defended && !windowClosed;

  return (
    <div className={`rounded-2xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#000] space-y-3 ${canDefend ? 'ring-4 ring-skyellow' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{name}</p>
          <p className="text-[11px] text-gray-500">
            {t('panel.report', { id: dispute.blockchainId })} · {dispute.raisedAt ? new Date(dispute.raisedAt).toLocaleDateString() : ''}
          </p>
        </div>
        <span className={`rounded border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase ${active ? 'bg-skyellow' : 'bg-gray-200'}`}>
          {statusLabel(t, dispute.status)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-black bg-skred-light p-2.5">
        <WalletAvatar address={dispute.bountyHunter} size={36} />
        <div className="min-w-[7rem] flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('reports.reporter')}</p>
          <p className="font-data text-sm font-bold">{shortAddr(dispute.bountyHunter)}</p>
        </div>
        <span className="rounded-full border-2 border-black bg-skred px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">
          {statusLabel(t, dispute.disputeType)}
        </span>
      </div>

      <details className="rounded-xl border-2 border-black bg-white p-2.5 text-sm" open={canDefend}>
        <summary className="cursor-pointer font-bold">{t('evidence.report')}</summary>
        <div className="mt-2"><EvidenceView cid={dispute.evidenceCID} /></div>
        {defended && (
          <div className="mt-3 border-t-2 border-black/10 pt-2">
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('evidence.defense')}</p>
            <EvidenceView cid={dispute.counterEvidenceCID} />
          </div>
        )}
      </details>

      {active && (
        <p className="rounded-xl border-2 border-black bg-skyellow-light p-2.5 text-sm">
          {defended ? (
            <span className="font-bold">{t('reports.withCommittee')}</span>
          ) : windowClosed ? (
            <span className="font-bold">{t('reports.windowClosed')}</span>
          ) : (
            <>
              <span className="font-bold">{t('reports.defenseLeft')}:</span> <span className="font-data">{clock.text ?? '—'}</span>
            </>
          )}
        </p>
      )}

      {canDefend && <NeoButton label={t('reports.defend')} variant="primary" className="!rounded-xl" fullWidth onClick={onDefend} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Committee Panel
// ─────────────────────────────────────────────────────────────────────────────

export function CommitteePanel({
  programIds,
  dashboardData,
  bare = false,
}: {
  programIds: number[];
  dashboardData: DashboardData;
  address: string;
  bare?: boolean;
}) {
  const { t } = useT();
  return (
    <section>
      {!bare && (
        <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skblue pl-4 leading-none">
          {t('panel.committeeDuties')}
        </h2>
      )}
      {programIds.length === 0 ? (
        <CompactEmpty title={t('panel.seatTitle')} body={`${t('panel.seatBody')} ${t('panel.waiting')}`} />
      ) : (
        <div className="space-y-4">
          {programIds.map((pid) => (
            <CommitteeProgramSection key={pid} programId={pid} dashboardData={dashboardData} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommitteeProgramSection({
  programId,
  dashboardData,
}: {
  programId: number;
  dashboardData: DashboardData;
}) {
  const { t } = useT();
  const { data: allApplicants = [] } = useProgramApplicants(String(programId));
  const { data: allMilestones = [] } = useProgramMilestones(String(programId));

  // Only a BY_COMMITTEE program takes committee scores; in BY_STUDENT mode the contract is expected
  // to reject them. The button stays available so the transaction can still be tried and inspected.
  const committeeScores =
    dashboardData.committeePrograms.find((p) => p.pid === programId)?.screeningMode === 0;
  const pendingApplicants = allApplicants.filter((a) => a.status === 'PENDING_REVIEW');
  const proposedMilestones = allMilestones.filter((m) => m.status === 'PROPOSED');
  // Reports in THIS program (not only the ones this wallet filed or is accused of), so a committee
  // member sees what they are meant to rule on.
  const programReports = (dashboardData.programDisputes ?? []).filter((d) => d.pid === programId);
  const activeDisputes = programReports.filter((d) => d.status === 'ACTIVE');

  const [scoreTarget, setScoreTarget] = useState<Applicant | null>(null);

  return (
    <NeoCard>
      <NeoCardBody>
        <h3 className="font-bold text-lg mb-4">{t('panel.program', { id: programId })}</h3>

        {pendingApplicants.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">
              {t('panel.awaitingScore', { n: pendingApplicants.length })}
            </p>
            <div className="space-y-2">
              {pendingApplicants.slice(0, 5).map((a) => (
                <div
                  key={`${a.pid}-${a.wallet}`}
                  className="flex items-center justify-between bg-white border-2 border-black shadow-[2px_2px_0_0_#000] p-3">
                  <span className="font-mono text-sm">{a.wallet.slice(0, 8)}…</span>
                  <NeoButton
                    label={t('panel.score')}
                    variant="primary"
                    size="sm"
                    onClick={() => setScoreTarget(a)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {!committeeScores && (
          <p className="mb-4 rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm">{t('panel.studentMode')}</p>
        )}

        {proposedMilestones.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">
              {t('panel.proposedMilestones', { n: proposedMilestones.length })}
            </p>
            <div className="space-y-2">
              {proposedMilestones.map((m) => (
                <CommitteeMilestoneVoteRow key={m.blockchainId} milestone={m} programId={programId} />
              ))}
            </div>
          </div>
        )}

        {activeDisputes.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">
              {t('panel.activeReports', { n: activeDisputes.length })}
            </p>
            <ProgramReportsPanel
              disputes={activeDisputes}
              showIntro={false}
              renderActions={(d) => <CommitteeDisputeVoteRow dispute={d} programId={programId} />}
            />
          </div>
        )}

        {pendingApplicants.length === 0 &&
          proposedMilestones.length === 0 &&
          activeDisputes.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">{t('panel.noActions')}</p>
          )}
      </NeoCardBody>

      {scoreTarget && (
        <CommitteeScoreModal
          isOpen
          onClose={() => setScoreTarget(null)}
          programId={programId}
          applicant={scoreTarget}
        />
      )}
    </NeoCard>
  );
}

function CommitteeMilestoneVoteRow({
  milestone,
  programId,
}: {
  milestone: Milestone;
  programId: number;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { voteOnMilestone, isPending } = useVoteOnMilestone();
  return (
    <div className="flex items-center justify-between bg-skpurple-light border-2 border-black p-3">
      <div>
        <span className="font-bold text-sm">{t('panel.milestoneNo', { id: milestone.blockchainId })}</span>
        <span className="text-xs text-gray-500 ml-2">
          {fmt(milestone.amount, milestone.token)}
        </span>
      </div>
      <div className="flex gap-1">
        <NeoButton
          label={t('panel.approve')}
          variant="success"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => voteOnMilestone(BigInt(milestone.blockchainId), BigInt(programId), true)}
        />
        <NeoButton
          label={t('panel.reject')}
          variant="danger"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => voteOnMilestone(BigInt(milestone.blockchainId), BigInt(programId), false)}
        />
      </div>
    </div>
  );
}

/** The program creator's own way to settle a report in their program (next to the committee's vote). */
export function CreatorRulingActions({ dispute }: { dispute: Dispute }) {
  const { t } = useT();
  const { resolveAsCreator, isPending } = useResolveDisputeAsCreator();
  const clock = useVotingClock(dispute.defenseDeadline);
  const defended = !!dispute.counterEvidenceCID;
  const windowClosed = dispute.defenseDeadline !== null && clock.ended;
  if (dispute.status !== 'ACTIVE' || dispute.pid === null) return null;

  // The contract only takes a ruling after a defense; with none, the report ends by itself once the window closes.
  if (!defended) {
    return <p className="rounded-xl border-2 border-black bg-white p-2.5 text-xs">{windowClosed ? t('reports.windowClosed') : t('panel.creatorWait')}</p>;
  }
  return (
    <div className="space-y-2 rounded-xl border-2 border-black bg-skyellow-light p-3">
      <p className="text-xs font-bold">{t('panel.creatorRule')}</p>
      <div className="flex gap-2">
        <NeoButton
          label={t('panel.uphold')}
          variant="danger"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => resolveAsCreator(BigInt(dispute.blockchainId), BigInt(dispute.pid ?? 0), true)}
        />
        <NeoButton
          label={t('panel.dismiss')}
          variant="ghost"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => resolveAsCreator(BigInt(dispute.blockchainId), BigInt(dispute.pid ?? 0), false)}
        />
      </div>
    </div>
  );
}

function CommitteeDisputeVoteRow({ dispute, programId }: { dispute: Dispute; programId: number }) {
  const { t } = useT();
  const { voteOnDispute, isPending } = useVoteOnDispute();
  return (
    <div className="bg-skred-light border-2 border-black p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-bold text-sm">{t('panel.report', { id: dispute.blockchainId })}</span>
          <span className="text-xs text-skred ml-2 font-bold">
            {statusLabel(t, dispute.disputeType)}
          </span>
        </div>
      </div>

      {/* The committee decides on this, so it reads the report and the defense before voting. */}
      <details className="bg-white border-2 border-black p-2 text-sm">
        <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-skred">{t('evidence.report')}</summary>
        <div className="mt-2"><EvidenceView cid={dispute.evidenceCID} /></div>
      </details>
      <details className="bg-white border-2 border-black p-2 text-sm">
        <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider">{t('evidence.defense')}</summary>
        <div className="mt-2"><EvidenceView cid={dispute.counterEvidenceCID} empty={t('evidence.noDefense')} /></div>
      </details>

      <div className="flex gap-1">
        <NeoButton
          label={t('panel.uphold')}
          variant="danger"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => voteOnDispute(BigInt(dispute.blockchainId), BigInt(programId), true)}
        />
        <NeoButton
          label={t('panel.dismiss')}
          variant="ghost"
          size="sm"
          loading={isPending}
          disabled={isPending}
          onClick={() => voteOnDispute(BigInt(dispute.blockchainId), BigInt(programId), false)}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports against a program (creator's side)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every report filed against someone in the program, for the person who created it: who reported
 * whom, what kind of fraud, the evidence, how long the accused has to answer, and the state.
 */
export function ProgramReportsPanel({
  disputes,
  renderActions,
  showIntro = true,
}: {
  disputes: Dispute[];
  /** Extra controls under a report (the committee's vote buttons). */
  renderActions?: (d: Dispute) => React.ReactNode;
  showIntro?: boolean;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  if (disputes.length === 0) {
    return (
      <NeoCard hoverable={false} className="border-dashed">
        <NeoCardBody className="py-10 text-center">
          <h3 className="font-paytone text-xl mb-1">{t('progReports.emptyTitle')}</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">{t('progReports.emptyBody')}</p>
        </NeoCardBody>
      </NeoCard>
    );
  }

  return (
    <div className="space-y-4">
      {showIntro && <p className="text-sm text-gray-700">{t('progReports.intro')}</p>}
      {disputes.map((d) => {
        const deadline = d.defenseDeadline ? new Date(d.defenseDeadline) : null;
        return (
          <NeoCard key={d.blockchainId} hoverable={false}>
            <NeoCardBody className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold">{t('panel.report', { id: d.blockchainId })}</h3>
                  <p className="text-xs text-gray-600 font-mono">
                    {t('progReports.reporter')} {short(d.bountyHunter)} → {t('progReports.accused')} {short(d.scholarAddress)}
                  </p>
                </div>
                <span className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-bold uppercase ${d.status === 'ACTIVE' ? 'bg-skyellow' : d.status.includes('WON') || d.status.includes('GUILTY') || d.status.includes('CONCEDED') ? 'bg-skgreen' : 'bg-skred text-white'}`}>
                  {statusLabel(t, d.status)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-gray-500">{t('progReports.type')}</dt><dd className="font-bold">{statusLabel(t, d.disputeType)}</dd></div>
                <div><dt className="text-gray-500">{t('panel.stakePaid')}</dt><dd className="font-data font-bold">{fmt(d.stake, d.token)}</dd></div>
                {d.milestoneId !== null && (
                  <div><dt className="text-gray-500">{t('progReports.milestone')}</dt><dd className="font-bold">#{d.milestoneId}</dd></div>
                )}
                {deadline && (
                  <div><dt className="text-gray-500">{t('progReports.answerBy')}</dt><dd className="font-bold">{deadline.toLocaleString()}</dd></div>
                )}
              </dl>

              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-1">{t('progReports.evidence')}</p>
                <EvidenceView cid={d.evidenceCID} />
              </div>
              {d.counterEvidenceCID && (
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500 mb-1">{t('progReports.defence')}</p>
                  <EvidenceView cid={d.counterEvidenceCID} />
                </div>
              )}
              {renderActions?.(d)}
              <Link to="/report"><NeoButton label={t('progReports.open')} variant="secondary" size="sm" className="!rounded-xl" /></Link>
            </NeoCardBody>
          </NeoCard>
        );
      })}
    </div>
  );
}
