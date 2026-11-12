import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { formatTokenAmount } from '@/lib/contracts/v4/token';
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { useFormatMoney } from '@/lib/money';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import {
  useOpenApplications,
  useOpenScreening,
  useCancelProgram,
  useClaimYield,
  useSubmitMilestone,
  useExecuteMilestone,
  useTriggerAutoGuilty,
  useVoteOnDispute,
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
import { ProposeMilestoneModal } from './ProposeMilestoneModal';
import { CommitteeScoreModal } from './CommitteeScoreModal';
import { SubmitMilestoneModal } from './SubmitMilestoneModal';
import { ExtendDeadlineModal } from './ExtendDeadlineModal';
import { BountyHunterRaiseDisputeModal } from './BountyHunterRaiseDisputeModal';

// ─────────────────────────────────────────────────────────────────────────────
// Initiator Panel
// ─────────────────────────────────────────────────────────────────────────────

export function InitiatorPanel({ 
  programs, 
  onOpenCreateModal 
}: { 
  programs: Program[]; 
  onOpenCreateModal: () => void;
}) {
  const { t } = useT();
  const [manageCommitteeFor, setManageCommitteeFor] = useState<number | null>(null);
  const [resolveShortlistFor, setResolveShortlistFor] = useState<Program | null>(null);
  const [selectWinnersFor, setSelectWinnersFor] = useState<Program | null>(null);

  return (
    <section>
      <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skpink pl-4 leading-none">
        {t('panel.initiated')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              onResolveShortlist={() => setResolveShortlistFor(p)}
              onSelectWinners={() => setSelectWinnersFor(p)}
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

      {resolveShortlistFor && (
        <ResolveShortlistForProgram
          program={resolveShortlistFor}
          onClose={() => setResolveShortlistFor(null)}
        />
      )}

      {selectWinnersFor && (
        <SelectWinnersForProgram
          program={selectWinnersFor}
          onClose={() => setSelectWinnersFor(null)}
        />
      )}
    </section>
  );
}

function ResolveShortlistForProgram({
  program,
  onClose,
}: {
  program: Program;
  onClose: () => void;
}) {
  const { data: applicants = [] } = useProgramApplicants(String(program.pid));
  return (
    <ResolveShortlistModal
      isOpen
      onClose={onClose}
      programId={program.pid}
      applicants={applicants}
    />
  );
}

function SelectWinnersForProgram({ program, onClose }: { program: Program; onClose: () => void }) {
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

function InitiatorProgramCard({
  program,
  onManageCommittee,
  onResolveShortlist,
  onSelectWinners,
}: {
  program: Program;
  onManageCommittee: () => void;
  onResolveShortlist: () => void;
  onSelectWinners: () => void;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { openApplications, isPending: openingApps } = useOpenApplications();
  const { openScreening, isPending: openingScreen } = useOpenScreening();
  const { cancelProgram, isPending: cancelling } = useCancelProgram();
  const { claimYield, isPending: claiming } = useClaimYield();

  const [isExtending, setIsExtending] = useState(false);

  const isFinal = ['COMPLETED', 'CANCELLED'].includes(program.status);

  return (
    <NeoCard>
      <NeoCardBody>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-bold text-lg">{t('panel.program', { id: program.pid })}</h3>
            <p className="text-xs text-gray-500 uppercase font-bold">
              {statusLabel(t, program.status)}
              {!program.openDonation && (
                <span className="ml-2 bg-black text-white px-1.5 py-0.5 rounded text-[10px]">{t('panel.private')}</span>
              )}
            </p>
            <p className="text-sm mt-1">
              {fmt(program.totalFund, program.token)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{t('panel.earnings')}</p>
            <p className="font-paytone text-emerald-700">
              {fmt(program.yieldAccrued, program.token)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/programs/$id" params={{ id: String(program.pid) }} className="col-span-2">
            <NeoButton label={t('panel.view')} variant="secondary" fullWidth />
          </Link>

          {program.status === 'CREATED' && (
            <div className="col-span-2">
              <NeoButton
                label={openingApps ? t('panel.opening') : t('panel.openApps')}
                variant="primary"
                fullWidth
                loading={openingApps}
                disabled={openingApps}
                onClick={() => openApplications(BigInt(program.pid))}
              />
            </div>
          )}

          {program.status === 'APPLICATION_OPEN' && (
            <>
              <div className="col-span-1">
                <NeoButton
                  label={openingScreen ? t('panel.opening') : t('panel.screening')}
                  variant="primary"
                  fullWidth
                  loading={openingScreen}
                  disabled={openingScreen}
                  onClick={() => openScreening(BigInt(program.pid))}
                />
              </div>
              <div className="col-span-1">
                <NeoButton
                  label={t('panel.extend')}
                  variant="secondary"
                  fullWidth
                  onClick={() => setIsExtending(true)}
                />
              </div>
            </>
          )}

          {program.status === 'SCREENING' && (
            <div className="col-span-2">
              <NeoButton
                label={t('panel.resolve')}
                variant="primary"
                fullWidth
                onClick={onResolveShortlist}
              />
            </div>
          )}

          {program.status === 'VOTING' && (
            <>
              <div className="col-span-1">
                <NeoButton
                  label={t('panel.selectWinners')}
                  variant="success"
                  fullWidth
                  onClick={onSelectWinners}
                />
              </div>
              <div className="col-span-1">
                <NeoButton
                  label={t('panel.extend')}
                  variant="secondary"
                  fullWidth
                  onClick={() => setIsExtending(true)}
                />
              </div>
            </>
          )}

          {!isFinal && (
            <NeoButton
              label={t('panel.manageCommittee')}
              variant="secondary"
              fullWidth
              onClick={onManageCommittee}
            />
          )}

          {program.status === 'COMPLETED' && BigInt(program.yieldAccrued) > 0n && (
            <NeoButton
              label={claiming ? t('panel.claiming') : t('panel.claimEarnings')}
              variant="success"
              fullWidth
              loading={claiming}
              disabled={claiming}
              onClick={() =>
                claimYield(
                  BigInt(program.pid),
                  '0x0000000000000000000000000000000000000000',
                )
              }
            />
          )}

          {!isFinal && (
            <NeoButton
              label={cancelling ? t('panel.cancelling') : t('panel.cancel')}
              variant="danger"
              fullWidth
              loading={cancelling}
              disabled={cancelling}
              onClick={() => cancelProgram(BigInt(program.pid))}
            />
          )}
        </div>
      </NeoCardBody>

      {isExtending && (
        <ExtendDeadlineModal
          isOpen
          onClose={() => setIsExtending(false)}
          program={program}
        />
      )}
    </NeoCard>
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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

          <div className="flex flex-col gap-2 w-full md:w-52">
            {scholar.status === 'FROZEN' ? (
              <div className="bg-red-100 p-2 border-2 border-red-500 rounded text-red-700 text-sm font-bold text-center">
                {t('panel.frozenUntil', { date: scholar.freezeUntil ? new Date(scholar.freezeUntil).toLocaleDateString() : '—' })}
              </div>
            ) : nextPending ? (
              <div className="flex flex-col gap-2">
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
                    <NeoButton
                      label={
                        isSubmitting ? t('panel.triggering') : t('panel.triggerDelivery', { id: nextPending.blockchainId })
                      }
                      variant="primary"
                      fullWidth
                      loading={isSubmitting}
                      disabled={isSubmitting}
                      onClick={() => submitMilestone(BigInt(nextPending.blockchainId), 'NO_PROOF_REQUIRED')}
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
                  className="flex items-center justify-between text-sm bg-white px-3 py-2.5 border-2 border-black shadow-[2px_2px_0_0_#000]">
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

// ─────────────────────────────────────────────────────────────────────────────
// Voter Panel
// ─────────────────────────────────────────────────────────────────────────────

export function VoterPanel({
  votes,
  stakes,
}: {
  votes: DashboardData['votes'];
  stakes: DashboardData['stakes'];
  dashboardData: DashboardData;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  return (
    <section>
      <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skpurple pl-4 leading-none">
        {t('panel.voterActivity')}
      </h2>
      
      {votes.length === 0 && stakes.length === 0 ? (
        <NeoCard hoverable={false} className="bg-skpurple-light/30 border-dashed">
          <NeoCardBody className="py-12 text-center">
            <h3 className="font-paytone text-2xl mb-2 text-skpurple-dark">{t('panel.shapeTitle')}</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">{t('panel.shapeBody')}</p>
            <Link to="/vote">
              <NeoButton label={t('panel.discover')} variant="primary" size="lg" />
            </Link>
          </NeoCardBody>
        </NeoCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NeoCard>
          <NeoCardBody>
            <h3 className="font-bold mb-4">{t('panel.castVotes', { n: votes.length })}</h3>
            {votes.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('panel.noVotes')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {votes.slice(0, 5).map((v) => (
                  <li key={`${v.pid}-${v.voterAddress}`} className="flex justify-between border-b border-gray-200 pb-1">
                    <span>{t('panel.progShort', { id: v.pid })}</span>
                    <span className="font-mono">{v.candidateAddress.slice(0, 6)}…</span>
                  </li>
                ))}
              </ul>
            )}
          </NeoCardBody>
        </NeoCard>

        <NeoCard>
          <NeoCardBody>
            <h3 className="font-bold mb-4">{t('panel.backings', { n: stakes.length })}</h3>
            {stakes.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('panel.noBackings')}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {stakes.map((s) => (
                  <li key={`${s.pid}-${s.voterAddress}`} className="flex justify-between border-b border-gray-200 pb-1">
                    <span>{t('panel.progShort', { id: s.pid })}</span>
                    <span
                      className={
                        s.isResolved
                          ? s.wasSlashed
                            ? 'text-skred'
                            : 'text-skgreen'
                          : 'text-skyellow'
                      }>
                      {fmt(s.amount, s.token)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </NeoCardBody>
        </NeoCard>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounty Hunter Panel
// ─────────────────────────────────────────────────────────────────────────────

export function BountyHunterPanel({
  disputes,
}: {
  disputes: DashboardData['disputes'];
}) {
  const { t } = useT();
  const { rate } = useTokenRate();
  const [raiseDisputeOpen, setRaiseDisputeOpen] = useState(false);

  const wonCount = disputes.filter(d => d.status.includes('WON') || d.status.includes('GUILTY') || d.status.includes('CONCEDED')).length;
  const lostCount = disputes.filter(d => d.status.includes('LOST') || d.status.includes('REJECTED')).length;
  const activeCount = disputes.filter(d => d.status === 'ACTIVE').length;
  const totalReward = disputes.reduce((acc, obj) => acc + Number(formatTokenAmount(obj.bhRewardPaid || "0", obj.token)), 0);

  return (
    <section>
      <div className="flex justify-between items-end mb-4">
        <h2 className="font-paytone text-3xl border-l-8 border-skgreen pl-4 leading-none">
          {t('panel.reporterActivity')}
        </h2>
        <NeoButton label={t('panel.raise')} variant="danger" size="sm" onClick={() => setRaiseDisputeOpen(true)} />
      </div>

      {disputes.length === 0 ? (
        <NeoCard hoverable={false} className="bg-skgreen-light/30 border-dashed mb-6">
          <NeoCardBody className="py-12 text-center">
            <h3 className="font-paytone text-2xl mb-2 text-skgreen-dark">{t('panel.guardTitle')}</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">{t('panel.guardBody')}</p>
            <NeoButton label={t('panel.startReporting')} variant="primary" size="lg" onClick={() => setRaiseDisputeOpen(true)} />
          </NeoCardBody>
        </NeoCard>
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

      {raiseDisputeOpen && (
        <BountyHunterRaiseDisputeModal
          isOpen
          onClose={() => setRaiseDisputeOpen(false)}
        />
      )}
    </section>
  );
}

function BountyDisputeCard({ dispute }: { dispute: Dispute }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { triggerAutoGuilty, isPending: triggering } = useTriggerAutoGuilty();

  const now = Date.now();
  const defenseDeadlinePassed =
    dispute.defenseDeadline !== null && new Date(dispute.defenseDeadline).getTime() < now;
  const noCounterEvidence = !dispute.counterEvidenceCID;
  const canAutoGuilty = dispute.status === 'ACTIVE' && defenseDeadlinePassed && noCounterEvidence;

  return (
    <NeoCard>
      <NeoCardBody>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold">{t('panel.report', { id: dispute.blockchainId })}</h3>
            <p className="text-xs text-gray-500 font-mono">
              {t('panel.target', { addr: `${dispute.scholarAddress.slice(0, 6)}…` })}
            </p>
          </div>
          <span
            className={`px-2 py-0.5 border-2 border-black rounded text-[10px] font-bold uppercase ${
              dispute.status === 'ACTIVE'
                ? 'bg-skyellow text-black'
                : dispute.status.includes('WON') ||
                    dispute.status.includes('GUILTY') ||
                    dispute.status.includes('CONCEDED')
                  ? 'bg-skgreen text-black'
                  : 'bg-skred text-white'
            }`}>
            {statusLabel(t, dispute.status)}
          </span>
        </div>

        <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-200 mb-3">
          <span className="text-gray-500">{t('panel.rewardPaid')}</span>
          <span className="font-bold font-paytone">
            {fmt(dispute.bhRewardPaid, dispute.token)}
          </span>
        </div>

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

        {dispute.status === 'ACTIVE' && !defenseDeadlinePassed && dispute.defenseDeadline && (
          <p className="text-xs text-gray-500 text-center mt-2">
            {t('panel.responseDeadline', { date: new Date(dispute.defenseDeadline).toLocaleDateString() })}
          </p>
        )}
      </NeoCardBody>
    </NeoCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Committee Panel
// ─────────────────────────────────────────────────────────────────────────────

export function CommitteePanel({
  programIds,
  dashboardData,
}: {
  programIds: number[];
  dashboardData: DashboardData;
  address: string;
}) {
  const { t } = useT();
  return (
    <section>
      <h2 className="font-paytone text-3xl mb-4 border-l-8 border-skblue pl-4 leading-none">
        {t('panel.committeeDuties')}
      </h2>
      {programIds.length === 0 ? (
        <NeoCard hoverable={false} className="bg-skyellow-light/30 border-dashed">
          <NeoCardBody className="py-12 text-center">
            <h3 className="font-paytone text-2xl mb-2 text-skyellow-dark">{t('panel.seatTitle')}</h3>
            <p className="text-gray-600 mb-4 max-w-md mx-auto">{t('panel.seatBody')}</p>
            <p className="text-xs text-gray-500 uppercase font-black">{t('panel.waiting')}</p>
          </NeoCardBody>
        </NeoCard>
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

  const pendingApplicants = allApplicants.filter((a) => a.status === 'PENDING_REVIEW');
  const proposedMilestones = allMilestones.filter((m) => m.status === 'PROPOSED');
  const activeDisputes = dashboardData.disputes.filter((d) => d.status === 'ACTIVE');

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
            <div className="space-y-2">
              {activeDisputes.map((d) => (
                <CommitteeDisputeVoteRow key={d.blockchainId} dispute={d} programId={programId} />
              ))}
            </div>
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

function CommitteeDisputeVoteRow({ dispute, programId }: { dispute: Dispute; programId: number }) {
  const { t } = useT();
  const { voteOnDispute, isPending } = useVoteOnDispute();
  return (
    <div className="flex items-center justify-between bg-skred-light border-2 border-black p-3">
      <div>
        <span className="font-bold text-sm">{t('panel.report', { id: dispute.blockchainId })}</span>
        <span className="text-xs text-skred ml-2 font-bold">
          {statusLabel(t, dispute.disputeType)}
        </span>
      </div>
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
