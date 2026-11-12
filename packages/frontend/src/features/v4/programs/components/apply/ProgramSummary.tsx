import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { useT } from '@/lib/i18n';
import { useFormatMoney } from '@/lib/money';
import type { Program } from '@/lib/api/types';

interface Props {
  program: Program;
  name?: string;
  organization?: string;
}

/** "3d 4h left" — or a closed label once the deadline has passed. */
function useTimeLeft(iso: string | null) {
  const { t } = useT();
  if (!iso) return '—';
  const secondsLeft = Math.floor(new Date(iso).getTime() / 1000) - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return t('apply.closedShort');
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  return t('apply.timeLeft', { d, h });
}

/** Side card on the apply page: the facts an applicant wants while filling the form. */
export function ProgramSummary({ program, name, organization }: Props) {
  const { t } = useT();
  const fmt = useFormatMoney();
  const timeLeft = useTimeLeft(program.applicationEnd);

  const rows: Array<[string, string]> = [
    [t('apply.summary.closes'), timeLeft],
    [t('apply.summary.winners'), String(program.targetWinners)],
    [t('apply.summary.applicants'), String(program.applicantCount)],
    [t('apply.summary.fund'), fmt(program.totalFund, program.token)],
    [t('apply.summary.scoring'), program.screeningMode === 0 ? t('detail.byCommittee') : t('detail.byStudent')],
  ];

  return (
    <NeoCard fill="white" hoverable={false}>
      <NeoCardBody className="space-y-4">
        <div className="space-y-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">
            {t('apply.summary.title')}
          </p>
          <h2 className="font-paytone text-xl leading-tight">{name ?? `Program #${program.pid}`}</h2>
          {organization && <p className="text-sm text-gray-600">{organization}</p>}
          <div className="pt-1">
            <NeoBadge status={program.status} />
          </div>
        </div>
        <dl className="space-y-2.5 text-sm border-t-2 border-black/10 pt-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</dt>
              <dd className="font-bold font-data text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </NeoCardBody>
    </NeoCard>
  );
}
