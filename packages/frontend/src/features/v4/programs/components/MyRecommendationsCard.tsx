import { useEffect, useState } from 'react';
import { NeoButton } from '@/components/ui/NeoButton';
import { CopyableText, truncateMiddle } from '@/components/ui/CopyableText';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useProgramRecommendations } from '@/lib/api/hooks';
import { useRecommendationOf, useSelectionAddress, useSubmitRecommendation } from '@/lib/contracts/v4/hooks/selection';
import { decodeRecommendation, recommendationLink } from '@/lib/recommendations';
import { useT } from '@/lib/i18n';

interface Props {
  programId: number;
  /** The connected applicant. */
  student: string;
}

/**
 * For an applicant: the recommendations they have so far, the link to send to people who could
 * recommend them, and a place to paste the signed code a recommender sent back.
 */
export function MyRecommendationsCard({ programId, student }: Props) {
  const { t } = useT();
  const selection = useSelectionAddress();
  const { count, average } = useRecommendationOf(programId, student);
  const { data: all = [] } = useProgramRecommendations(String(programId));
  const mine = all.filter((r) => r.student.toLowerCase() === student.toLowerCase());

  const { submit, isPending, isSuccess, error, reset } = useSubmitRecommendation();
  const [pasted, setPasted] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isSuccess) { setPasted(''); reset(); }
  }, [isSuccess, reset]);

  if (!selection) return null;

  const link = recommendationLink(programId, student);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* the link is in a selectable field below */ }
  };

  const handleSubmit = () => {
    setProblem(null);
    const decoded = decodeRecommendation(pasted);
    if (!decoded) return setProblem(t('rec.card.invalid'));
    if (decoded.pid !== programId || decoded.student.toLowerCase() !== student.toLowerCase()) return setProblem(t('rec.card.wrongApplicant'));
    submit(decoded);
  };

  return (
    <section className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_0_#000] space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-paytone text-xl">{t('rec.card.title')}</h3>
        <span className="font-data text-sm font-bold">
          {count > 0 ? t('rec.card.summary', { count, average }) : t('rec.card.none')}
        </span>
      </div>

      {mine.length > 0 && (
        <ul className="rounded-xl border-2 border-black divide-y divide-black/10">
          {mine.map((r) => (
            <li key={r.recommender} className="flex items-center justify-between gap-3 px-3 py-2">
              <CopyableText value={r.recommender} display={truncateMiddle(r.recommender, 6, 4)} />
              <span className="font-data font-bold">{r.score}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('rec.card.link')}</label>
        <div className="flex gap-2">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 font-data !text-xs !py-2" />
          <NeoButton label={copied ? t('rec.copied') : t('rec.card.copyLink')} variant="secondary" size="sm" className="!rounded-xl" onClick={copyLink} />
        </div>
        <p className="text-[11px] text-gray-500">{t('rec.card.max')}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('rec.card.paste')}</label>
        <textarea rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="rec1.…" className="w-full font-data !text-xs resize-none" />
        {problem && <p className="text-xs font-bold text-skred">{problem}</p>}
        {!!error && <ErrorNotice error={error} />}
        <NeoButton
          label={isPending ? t('rec.card.submitting') : t('rec.card.submit')}
          variant="primary"
          size="sm"
          className="!rounded-xl"
          loading={isPending}
          disabled={isPending || !pasted.trim()}
          onClick={handleSubmit}
        />
      </div>
    </section>
  );
}
