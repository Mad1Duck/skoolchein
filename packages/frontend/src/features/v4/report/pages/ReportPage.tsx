import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useProgramApplicants, useProgramMilestones, useProgramScholars, usePrograms } from '@/lib/api/hooks';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { Milestone, Program, Scholar } from '@/lib/api/types';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { useFormatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n';
import { ReportScholarCard } from '../components/ReportScholarCard';
import { ReportEvidenceModal } from '../components/ReportEvidenceModal';

interface Target {
  scholar: Scholar;
  milestone?: Milestone;
}

/**
 * Report a problem, in three steps: pick a program, look through its participants (application,
 * progress, milestones and the proof they handed in), then report either the participant or one
 * milestone with evidence.
 */
export function NewReportFlow() {
  const { t } = useT();
  const { address } = useAccount();
  const { data: programsData, isLoading } = usePrograms({ status: 'ACTIVE' });
  const programs = programsData?.data ?? [];
  const [pickedPid, setPickedPid] = useState<number | null>(null);
  const program = programs.find((p) => p.pid === pickedPid) ?? programs[0];

  return (
    <>
      <p className="mb-5 max-w-3xl text-lg font-medium text-black/80">{t('report.lead')}</p>

      <ol className="mb-8 grid gap-3 sm:grid-cols-3">
        {(['report.step1', 'report.step2', 'report.step3'] as const).map((key, i) => (
          <li key={key} className="flex items-center gap-3 rounded-2xl border-2 border-black bg-white p-3 shadow-[3px_3px_0_0_#000]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">{i + 1}</span>
            <span className="text-sm font-bold">{t(key)}</span>
          </li>
        ))}
      </ol>

      {isLoading ? (
        <NeoSkeleton lines={5} />
      ) : programs.length === 0 ? (
        <div className="rounded-2xl border-2 border-black bg-white p-12 text-center shadow-[4px_4px_0_0_#000]">
          <p className="font-paytone text-xl mb-1">{t('report.noPrograms')}</p>
          <p className="text-sm text-gray-500">{t('report.noProgramsBody')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-6 items-start">
          <aside className="space-y-3 lg:sticky lg:top-24">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">{t('report.programs')}</h2>
            {programs.map((p) => (
              <ProgramPick key={p.pid} program={p} selected={p.pid === program?.pid} onClick={() => setPickedPid(p.pid)} />
            ))}
          </aside>

          <div className="min-w-0 space-y-6">
            {program && <ProgramReport program={program} me={address} />}
          </div>
        </div>
      )}
    </>
  );
}

function ProgramPick({ program, selected, onClick }: { program: Program; selected: boolean; onClick: () => void }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-xl border-2 border-black p-4 text-left transition-all duration-75 ${
        selected ? 'bg-skpink shadow-[4px_4px_0_0_#000] -translate-y-0.5' : 'bg-white hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000]'
      }`}
    >
      <div className="font-bold leading-tight">{meta?.name ?? `Program #${program.pid}`}</div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
        <span className="rounded-full border-2 border-black bg-white px-2 py-0.5">{t('report.scholarsCount', { n: program.activeScholarCount ?? 0 })}</span>
      </div>
      <div className="mt-2 text-xs opacity-80 font-data">{fmt(program.totalFund, program.token)}</div>
    </button>
  );
}

function ProgramReport({ program, me }: { program: Program; me?: string }) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const pid = String(program.pid);
  const scholarsQ = useProgramScholars(pid);
  const milestonesQ = useProgramMilestones(pid);
  const applicantsQ = useProgramApplicants(pid);
  const [target, setTarget] = useState<Target | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  const scholars = scholarsQ.data ?? [];
  const milestones = milestonesQ.data ?? [];
  const applicants = applicantsQ.data ?? [];
  const mine = (w: string | null | undefined) => !!me && !!w && w.toLowerCase() === me.toLowerCase();

  return (
    <>
      <section className="rounded-2xl border-2 border-black bg-white p-5 shadow-[5px_5px_0_0_#000]">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-500">Program #{program.pid}</p>
        <h2 className="font-paytone text-2xl md:text-3xl leading-tight [overflow-wrap:anywhere]">{meta?.name ?? `Program #${program.pid}`}</h2>
        {meta?.description && <p className="mt-2 text-sm text-gray-700 [overflow-wrap:anywhere]">{meta.description}</p>}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label={t('votePage.fund')} value={fmt(program.totalFund, program.token)} />
          <Tile label={t('report.paidOut')} value={fmt(program.spentFund, program.token)} />
          <Tile label={t('votePage.winners')} value={String(program.targetWinners)} />
          <Tile label={t('detail.statScholars')} value={String(program.activeScholarCount ?? scholars.length)} />
        </div>
        <Link to="/programs/$id" params={{ id: String(program.pid) }} className="mt-3 inline-block text-xs font-bold underline">
          {t('report.openProgram')}
        </Link>
      </section>

      <section className="space-y-4">
        <h3 className="font-paytone text-2xl">{t('report.scholars', { n: scholars.length })}</h3>
        {scholarsQ.isLoading ? (
          <NeoSkeleton lines={4} />
        ) : scholars.length === 0 ? (
          <div className="rounded-2xl border-2 border-black bg-white p-10 text-center text-gray-500">{t('report.noScholars')}</div>
        ) : (
          scholars.map((s) => (
            <ReportScholarCard
              key={s.wallet}
              program={program}
              scholar={s}
              applicant={applicants.find((a) => a.wallet.toLowerCase() === s.wallet.toLowerCase())}
              milestones={milestones.filter((m) => m.scholarWallet?.toLowerCase() === s.wallet.toLowerCase())}
              isMe={mine(s.wallet)}
              onReportScholar={() => setTarget({ scholar: s })}
              onReportMilestone={(m) => setTarget({ scholar: s, milestone: m })}
            />
          ))
        )}
      </section>

      {target && (
        <ReportEvidenceModal
          program={program}
          scholar={target.scholar}
          milestone={target.milestone}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-black bg-white p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-data text-lg font-bold mt-1 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
