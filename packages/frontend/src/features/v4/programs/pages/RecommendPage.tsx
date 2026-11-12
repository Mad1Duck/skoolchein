import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { CopyableText, truncateMiddle } from '@/components/ui/CopyableText';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useProgram, useProgramApplicants } from '@/lib/api/hooks';
import { fetchProgramMeta } from '@/lib/ipfs';
import {
  useIsRecommender,
  useSelectionAddress,
  useSignRecommendation,
  useSubmitRecommendation,
} from '@/lib/contracts/v4/hooks/selection';
import { encodeRecommendation, type SignedRecommendation } from '@/lib/recommendations';
import { useT } from '@/lib/i18n';

const VALID_FOR_SECONDS = 7 * 24 * 60 * 60;

/**
 * Where a recommender vouches for an applicant. The score is signed with the recommender's wallet
 * (no transaction, no gas); the contract verifies the signature, so it cannot be changed or faked.
 * The signed result can be handed to the applicant as a code, or submitted right here.
 */
export function RecommendPage() {
  const { t } = useT();
  const { pid, student } = useParams({ from: '/recommend/$pid/$student' });
  const pidNum = Number(pid);
  const { address } = useAccount();
  const selection = useSelectionAddress();

  const { data: program, isLoading } = useProgram(pid);
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });
  const { data: applicants = [] } = useProgramApplicants(pid);
  const applicant = applicants.find((a) => a.wallet.toLowerCase() === student.toLowerCase());
  const { allowed } = useIsRecommender(pidNum, address);

  const { sign, isSigning } = useSignRecommendation();
  const { submit, isPending: submitting, isSuccess: submitted, error: submitError } = useSubmitRecommendation();

  const [score, setScore] = useState('90');
  const [signed, setSigned] = useState<SignedRecommendation | null>(null);
  const [copied, setCopied] = useState(false);
  const [signError, setSignError] = useState<unknown>(null);

  const programName = meta?.name ?? `Program #${pid}`;
  const scoreNum = Number(score);
  const scoreOk = score.trim() !== '' && Number.isInteger(scoreNum) && scoreNum >= 0 && scoreNum <= 100;

  // Why this wallet cannot recommend right now (mirrors ScholarshipSelection.submitRecommendation).
  const blocker = !selection ? t('settings.noContract')
    : !program ? null
    : program.screeningMode === 0 ? t('rec.committee')
    : !applicant ? t('rec.notApplicant')
    : applicant.status !== 'PENDING_REVIEW' || !['CREATED', 'APPLICATION_OPEN', 'SCREENING'].includes(program.status) ? t('rec.closed')
    : address && address.toLowerCase() === student.toLowerCase() ? t('rec.self')
    : address && program.recommendersRestricted && !allowed ? t('rec.notAllowed')
    : null;

  const handleSign = async () => {
    if (!address || !scoreOk) return;
    setSignError(null);
    try {
      setSigned(
        await sign({
          pid: pidNum,
          student: student as `0x${string}`,
          recommender: address,
          score: scoreNum,
          deadline: Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS,
        }),
      );
    } catch (e) {
      setSignError(e);
    }
  };

  const code = signed ? encodeRecommendation(signed) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: the code is selectable in the box */ }
  };

  if (isLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-12"><NeoSkeleton lines={5} /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-10 space-y-6">
      <Link to="/programs/$id" params={{ id: pid }} className="text-sm font-bold underline">← {t('rec.back')}</Link>

      <header className="space-y-2">
        <h1 className="font-paytone text-4xl leading-tight">{t('rec.title')}</h1>
        <p className="text-gray-700">{t('rec.intro', { program: programName })}</p>
      </header>

      <section className="rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0_0_#000] space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-skbw px-3 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('rec.applicant')}</span>
          <CopyableText value={student} display={truncateMiddle(student, 8, 6)} />
        </div>

        {!address ? (
          <div className="space-y-3">
            <p className="text-sm font-bold">{t('rec.connect')}</p>
            <NeoButton variant="connect" size="md" />
          </div>
        ) : blocker ? (
          <p className="rounded-xl border-2 border-black bg-skred-light px-3 py-2 text-sm font-bold">{blocker}</p>
        ) : submitted ? (
          <p className="rounded-xl border-2 border-black bg-skgreen px-3 py-3 text-sm font-bold">{t('rec.submitted')}</p>
        ) : !signed ? (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('rec.score')}</label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="w-full mt-1 font-paytone !text-3xl"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">{t('rec.scoreHint')} {t('rec.validFor')}</p>
            </div>
            <NeoButton
              label={isSigning ? t('rec.signing') : t('rec.sign')}
              variant="primary"
              size="lg"
              fullWidth
              className="!rounded-xl"
              loading={isSigning}
              disabled={isSigning || !scoreOk}
              onClick={handleSign}
            />
            {!!signError && <ErrorNotice error={signError} />}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-xl border-2 border-black bg-skgreen px-3 py-2 text-sm font-bold">{t('rec.signed')}</p>
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-widest text-gray-500">{t('rec.code')}</label>
              <textarea readOnly rows={4} value={code} onFocus={(e) => e.currentTarget.select()}
                className="w-full mt-1 font-data text-xs break-all resize-none" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <NeoButton label={copied ? t('rec.copied') : t('rec.copy')} variant="secondary" fullWidth className="!rounded-xl" onClick={copy} />
              <NeoButton
                label={t('rec.submitNow')}
                variant="primary"
                fullWidth
                className="!rounded-xl"
                loading={submitting}
                disabled={submitting}
                onClick={() => submit(signed)}
              />
            </div>
            {!!submitError && <ErrorNotice error={submitError} />}
          </div>
        )}
      </section>
    </div>
  );
}
