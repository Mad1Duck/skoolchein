import { useState } from 'react';
import { useProgramApplicants, useProgramScholars } from '@/lib/api/hooks';
import { CopyableText } from '@/components/ui/CopyableText';
import { formatTokenCompact } from '@/lib/contracts/v4/token';
import { useFormatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { toDate } from '@/lib/time';
import { useApplicationText } from '../../programs/components/useApplicationText';

/**
 * An amount shown as the program's token ("3,000 USDC"), with its Rupiah value underneath when a rate
 * is known. For the native currency there is no Rupiah value, so only the token line appears.
 */
export function DualAmount({ raw, token, align = 'left', size = 'text-lg' }: { raw: bigint | string; token: string; align?: 'left' | 'right'; size?: string }) {
  const fmt = useFormatMoney();
  const main = formatTokenCompact(raw, token);
  const local = fmt(raw, token);
  return (
    <span className={`block ${align === 'right' ? 'text-right' : ''}`}>
      <span className={`block font-data font-bold ${size} [overflow-wrap:anywhere]`}>{main}</span>
      {local !== main && <span className="block font-data text-xs text-gray-500">≈ {local}</span>}
    </span>
  );
}

export function Money({ label, raw, token, tone = 'bg-white' }: { label: string; raw: bigint; token: string; tone?: string }) {
  return (
    <div className={`${tone} rounded-xl border-2 border-black p-3`}>
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-gray-600">{label}</p>
      <DualAmount raw={raw} token={token} />
    </div>
  );
}

/** Who a winner is: full wallet, standing in the program and what they wrote when they applied. */
export function RecipientDetails({ pid, wallet }: { pid: number; wallet: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const same = (a: string) => a.toLowerCase() === wallet.toLowerCase();

  const { data: applicants } = useProgramApplicants(String(pid));
  const { data: scholars } = useProgramScholars(String(pid));
  const applicant = applicants?.find((a) => same(a.wallet));
  const scholar = scholars?.find((s) => same(s.wallet));

  const profile = useApplicationText(applicant?.profileCID ?? '', open && !!applicant);
  const essay = useApplicationText(applicant?.essayCID ?? '', open && !!applicant);
  const applied = toDate(applicant?.createdAt);

  return (
    <details className="rounded-xl border-2 border-black bg-white p-3 text-sm" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider">{t('recipient.details')}</summary>
      <div className="mt-3 space-y-3">
        <Row label={t('recipient.wallet')}>
          <CopyableText value={wallet} display={wallet} />
        </Row>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Row label={t('recipient.status')}>
            <span className="font-bold">{scholar ? statusLabel(t, scholar.status) : '—'}</span>
          </Row>
          <Row label={t('appl.score')}>
            <span className="font-data font-bold">{applicant ? t('appl.scoreOf', { score: Number(applicant.totalScore ?? 0) }) : '—'}</span>
          </Row>
          <Row label={t('recipient.applied')}>
            <span className="font-data font-bold">{applied ? applied.toLocaleDateString() : '—'}</span>
          </Row>
        </div>
        <Row label={t('appl.about')}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{profile.isLoading ? t('common.processing') : profile.data?.content || '—'}</p>
          {profile.data?.hackquestId && <p className="text-xs text-gray-500">{t('appl.hackquest')}: {profile.data.hackquestId}</p>}
        </Row>
        <Row label={t('appl.essay')}>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{essay.isLoading ? t('common.processing') : essay.data?.content || '—'}</p>
        </Row>
      </div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <div className="[overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}
