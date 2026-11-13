import { useState } from 'react';
import type { Applicant, Milestone, Program, Scholar } from '@/lib/api/types';
import { WalletAvatar } from '@/components/ui/WalletAvatar';
import { CopyableText, truncateMiddle } from '@/components/ui/CopyableText';
import { NeoButton } from '@/components/ui/NeoButton';
import { useFormatMoney } from '@/lib/money';
import { statusLabel } from '@/lib/i18n/status';
import { toDate } from '@/lib/time';
import { EvidenceView } from '@/components/ui/EvidenceView';
import { useApplicationText } from '@/features/v4/programs/components/useApplicationText';
import { useT } from '@/lib/i18n';

interface Props {
  program: Program;
  scholar: Scholar;
  /** The participant's own application, for comparing what they claimed. */
  applicant?: Applicant;
  milestones: Milestone[];
  isMe: boolean;
  onReportScholar: () => void;
  onReportMilestone: (m: Milestone) => void;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-skyellow',
  SUBMITTED: 'bg-skpurple text-white',
  COMPLETED: 'bg-skgreen',
  FROZEN: 'bg-skred text-white',
  DISPUTED: 'bg-skorange',
};

/**
 * One participant, with everything a reporter needs to judge them: how far they are and what they
 * were paid, what they wrote in their application, and every milestone with the proof they handed in.
 */
export function ReportScholarCard({ program, scholar, applicant, milestones, isMe, onReportScholar, onReportMilestone }: Props) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const [open, setOpen] = useState(false);

  const done = scholar.currentMilestone;
  const total = Math.max(1, scholar.totalMilestones);
  const active = scholar.status === 'ACTIVE';

  return (
    <article className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#000]">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <WalletAvatar address={scholar.wallet} size={44} />
        <div className="min-w-0 flex-1">
          <CopyableText value={scholar.wallet} display={truncateMiddle(scholar.wallet, 8, 6)} />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border-2 border-black px-2 py-0.5 font-extrabold uppercase tracking-wider ${STATUS_TONE[scholar.status] ?? 'bg-gray-100'}`}>
              {statusLabel(t, scholar.status)}
            </span>
            <span className="text-gray-600">
              {t('report.received')}: <span className="font-data font-bold">{fmt(scholar.totalReceived, program.token)}</span>
            </span>
          </div>
        </div>

        <div className="w-full sm:w-44">
          <div className="flex justify-between text-[11px] font-bold">
            <span>{t('report.progress')}</span>
            <span className="font-data">{done} / {scholar.totalMilestones}</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full border-2 border-black bg-gray-200">
            <div className="h-full bg-skpurple" style={{ width: `${Math.min(100, (done / total) * 100)}%` }} />
          </div>
        </div>

        {isMe ? (
          <span className="rounded-xl border-2 border-black bg-gray-100 px-3 py-2 text-xs font-extrabold uppercase text-gray-500">
            {t('report.yourself')}
          </span>
        ) : (
          <NeoButton
            label={t('report.reportScholar')}
            variant="danger"
            size="sm"
            className="!rounded-xl"
            disabled={!active}
            onClick={onReportScholar}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full border-t-2 border-black px-4 py-2 text-left text-xs font-extrabold uppercase tracking-wider hover:bg-skbw"
      >
        {open ? '▾' : '▸'} {t('report.details', { n: milestones.length })}
      </button>

      {open && (
        <div className="space-y-4 border-t-2 border-black bg-skbw/40 p-4">
          {applicant && <ApplicationText applicant={applicant} />}

          <div className="space-y-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-gray-500">{t('report.milestones')}</p>
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-500">{t('report.noMilestones')}</p>
            ) : (
              milestones.map((m) => (
                <MilestoneRow
                  key={m.blockchainId}
                  milestone={m}
                  program={program}
                  canReport={!isMe && active && m.status === 'SUBMITTED'}
                  onReport={() => onReportMilestone(m)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function ApplicationText({ applicant }: { applicant: Applicant }) {
  const { t } = useT();
  const profile = useApplicationText(applicant.profileCID, true);
  const essay = useApplicationText(applicant.essayCID, true);
  const docs = useApplicationText(applicant.documentCID, true);

  const blocks: Array<[string, string | undefined, boolean]> = [
    [t('appl.about'), profile.data?.content, profile.isLoading],
    [t('appl.essay'), essay.data?.content, essay.isLoading],
    [t('appl.docs'), docs.data?.content, docs.isLoading],
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-extrabold uppercase tracking-widest text-gray-500">{t('report.profile')}</p>
      {blocks.map(([title, text, loading]) => (
        <div key={title} className="rounded-xl border-2 border-black bg-white p-3">
          <p className="font-bold text-sm">{title}</p>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {loading ? t('appl.loading') : text?.trim() || t('report.noText')}
          </p>
        </div>
      ))}
    </div>
  );
}

function MilestoneRow({
  milestone: m,
  program,
  canReport,
  onReport,
}: {
  milestone: Milestone;
  program: Program;
  canReport: boolean;
  onReport: () => void;
}) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const [showProof, setShowProof] = useState(false);
  const deadline = toDate(m.disputeDeadline);

  return (
    <div className="rounded-xl border-2 border-black bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-bold font-data">#{m.blockchainId}</span>
          <span className="ml-2 rounded-sm bg-gray-200 px-1.5 py-0.5 text-[10px] font-extrabold uppercase">{statusLabel(t, m.kind)}</span>
          <span className="ml-2 font-data text-gray-600">{fmt(m.amount, m.token ?? program.token)}</span>
        </div>
        <span className={`rounded-full border-2 border-black px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${STATUS_TONE[m.status] ?? 'bg-gray-100'}`}>
          {statusLabel(t, m.status)}
        </span>
      </div>

      {m.status === 'SUBMITTED' && deadline && (
        <p className="mt-1 text-xs text-gray-600">{t('report.reviewUntil', { date: deadline.toLocaleString() })}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {m.proofCID && (
          <button type="button" onClick={() => setShowProof((s) => !s)} className="text-xs font-bold underline">
            {showProof ? t('report.hideProof') : t('report.showProof')}
          </button>
        )}
        {m.status === 'SUBMITTED' ? (
          <NeoButton label={t('report.reportMilestone')} variant="danger" size="sm" className="!rounded-xl" disabled={!canReport} onClick={onReport} />
        ) : (
          <span className="text-[11px] text-gray-500">{t('report.notReportable')}</span>
        )}
      </div>

      {showProof && (
        <div className="mt-2 rounded-lg border-2 border-black bg-skyellow-light p-2 text-sm [overflow-wrap:anywhere]">
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('report.proof')}</p>
          {/^AUTO_VERIFIED/.test(m.proofCID) ? (
            <p>{t('report.proofAuto')}</p>
          ) : (
            <EvidenceView cid={m.proofCID} empty={t('report.proofNone')} />
          )}
        </div>
      )}
    </div>
  );
}
