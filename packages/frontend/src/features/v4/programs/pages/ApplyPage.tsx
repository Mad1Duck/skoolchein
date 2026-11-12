import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorNotice } from '@/components/ErrorNotice';
import { useParams, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useProgram, useProgramApplicants } from '@/lib/api/hooks';
import { fetchProgramMeta, uploadToIPFS } from '@/lib/ipfs';
import { useApplyProgram } from '@/lib/contracts/write-hooks';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { useT } from '@/lib/i18n';
import { statusLabel } from '@/lib/i18n/status';
import { ApplyStepper } from '../components/apply/ApplyStepper';
import { ProgramSummary } from '../components/apply/ProgramSummary';

const BIO_MIN = 20;
const ESSAY_MIN = 100;

const STEP_LABEL = {
  about: 'apply.step.about',
  essay: 'apply.step.essay',
  scores: 'apply.step.scores',
  review: 'apply.step.review',
} as const;
type StepKey = keyof typeof STEP_LABEL;

type Form = {
  bio: string;
  hackquestId: string;
  essay: string;
  documents: string;
  recommendation: string;
  // Scores stay strings so an untouched field is empty rather than a made-up default.
  academic: string;
  income: string;
  recommend: string;
};

const EMPTY_FORM: Form = {
  bio: '',
  hackquestId: '',
  essay: '',
  documents: '',
  recommendation: '',
  academic: '',
  income: '',
  recommend: '',
};

const isScore = (v: string) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100;

const labelCls = 'block text-xs font-extrabold uppercase tracking-widest mb-1.5';
const hintCls = 'text-xs text-gray-500 mt-1';

function Field({
  label,
  hint,
  count,
  min,
  children,
}: {
  label: string;
  hint?: string;
  count?: number;
  min?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      <div className="flex justify-between gap-3">
        {hint ? <p className={hintCls}>{hint}</p> : <span />}
        {count !== undefined && min !== undefined && (
          <p className={`${hintCls} shrink-0 font-data ${count >= min ? 'text-skgreen' : ''}`}>
            {count}/{min}
          </p>
        )}
      </div>
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-24 text-center">
      <div className="bg-white border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg p-10 inline-block">
        <h2 className="font-paytone text-3xl mb-3">{title}</h2>
        <p className="text-gray-600 mb-6">{body}</p>
        {action}
      </div>
    </div>
  );
}

export function ApplyPage() {
  const { t } = useT();
  // strict:false so the page works under both /apply/$id and /programs/$id/apply.
  const { id } = useParams({ strict: false }) as { id: string };
  const { address, isConnected } = useAccount();
  const { chainId } = useActiveChain();

  const { data: program, isLoading } = useProgram(id);
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
  });
  const applicantsQ = useProgramApplicants(id);
  const myApplication = address
    ? (applicantsQ.data ?? []).find((a) => a.wallet.toLowerCase() === address.toLowerCase())
    : undefined;

  const { apply, isSuccess: applied, error: applyError, reset: resetApply } = useApplyProgram();

  const committeeMode = program?.screeningMode === 0;
  const steps: StepKey[] = useMemo(
    () => (committeeMode ? ['about', 'essay', 'review'] : ['about', 'essay', 'scores', 'review']),
    [committeeMode],
  );

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [stepIdx, setStepIdx] = useState(0);
  const [agree, setAgree] = useState(false);
  const [phase, setPhase] = useState<'edit' | 'uploading' | 'tx' | 'done'>('edit');
  const [uploaded, setUploaded] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((p) => ({ ...p, [key]: value }));

  // ── Draft: keep what the user typed on this device so a refresh doesn't wipe a long essay.
  const draftKey = `skoolcein.applyDraft:${chainId}:${id}:${address?.toLowerCase() ?? 'anon'}`;
  const hydrated = useRef<string | null>(null);

  useEffect(() => {
    if (hydrated.current === draftKey) return;
    const previous = hydrated.current;
    hydrated.current = draftKey;
    // Same program, different wallet key (the user typed first, then connected):
    // keep what is on screen instead of wiping it.
    const sameProgram = previous?.startsWith(`skoolcein.applyDraft:${chainId}:${id}:`) ?? false;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setForm({ ...EMPTY_FORM, ...(JSON.parse(raw) as Partial<Form>) });
      else if (!sameProgram) setForm(EMPTY_FORM);
    } catch {
      if (!sameProgram) setForm(EMPTY_FORM);
    }
  }, [draftKey, chainId, id]);

  useEffect(() => {
    if (hydrated.current !== draftKey || phase === 'done') return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(form));
      } catch {
        /* storage unavailable: the form still works, just without a draft */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form, draftKey, phase]);

  useEffect(() => {
    if (applied) {
      setPhase('done');
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    }
  }, [applied, draftKey]);

  // A failed wallet confirmation sends the user back to the review step with the error shown.
  useEffect(() => {
    if (applyError && phase === 'tx') setPhase('edit');
  }, [applyError, phase]);

  const stepKey = steps[Math.min(stepIdx, steps.length - 1)];

  const stepValid = (key: StepKey) => {
    switch (key) {
      case 'about':
        return form.bio.trim().length >= BIO_MIN;
      case 'essay':
        return form.essay.trim().length >= ESSAY_MIN;
      case 'scores':
        return isScore(form.academic) && isScore(form.income) && isScore(form.recommend);
      case 'review':
        return agree;
    }
  };

  const goNext = () => {
    if (!stepValid(stepKey)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  const goPrev = () => {
    setShowErrors(false);
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  const submit = async () => {
    if (!program || !steps.every(stepValid)) {
      setShowErrors(true);
      return;
    }
    resetApply();
    setUploadFailed(false);
    setUploaded(0);
    setPhase('uploading');

    try {
      const suffix = `${address ?? 'anonymous'}-${Date.now()}`;
      const upload = async (type: string, name: string, meta: Record<string, unknown>, fallback: string) => {
        const res = await uploadToIPFS({ meta, type, name: `${name}-${suffix}` });
        setUploaded((n) => n + 1);
        if (res?.metaCID) return res.metaCID;
        // Storing a made-up CID on the blockchain would be permanent, so only allow it in local dev.
        if (import.meta.env.DEV) return fallback;
        throw new Error('IPFS upload returned no CID');
      };

      const [profileCID, essayCID, documentCID, recommendCID] = await Promise.all([
        upload('application-profile', 'profile', { content: form.bio, hackquestId: form.hackquestId }, 'QmProfileFallback123'),
        upload('application-essay', 'essay', { content: form.essay }, 'QmEssayFallback123'),
        upload('application-doc', 'document', { content: form.documents }, 'QmDocFallback123'),
        upload('application-recommend', 'recommendation', { content: form.recommendation }, 'QmRecommendFallback123'),
      ]);

      setPhase('tx');
      apply({
        pid: BigInt(program.pid),
        profileCID,
        documentCID,
        essayCID,
        recommendCID,
        // Committee-scored programs ignore self-declared scores on-chain.
        academicScore: committeeMode ? 0n : BigInt(form.academic),
        incomeScore: committeeMode ? 0n : BigInt(form.income),
        recommendScore: committeeMode ? 0n : BigInt(form.recommend),
      });
    } catch (err) {
      console.error(err);
      setUploadFailed(true);
      setPhase('edit');
    }
  };

  // ── Gates ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <NeoSkeleton lines={5} />
      </div>
    );
  }

  if (!program) {
    return (
      <Notice
        title={t('detail.notFound')}
        body={t('apply.notFoundBody')}
        action={
          <Link to="/programs">
            <NeoButton label={t('detail.back')} variant="secondary" size="md" />
          </Link>
        }
      />
    );
  }

  const backToProgram = (
    <Link to="/programs/$id" params={{ id }}>
      <NeoButton label={t('apply.back')} variant="secondary" size="md" />
    </Link>
  );

  if (phase !== 'done') {
    if (program.status !== 'APPLICATION_OPEN') {
      return <Notice title={t('apply.closed.title')} body={t('apply.closed.body')} action={backToProgram} />;
    }
    if (address && address.toLowerCase() === program.initiator.toLowerCase()) {
      return <Notice title={t('apply.own.title')} body={t('apply.own.body')} action={backToProgram} />;
    }
    if (myApplication && ['SHORTLISTED', 'LOCKED'].includes(myApplication.status)) {
      return (
        <Notice
          title={t('apply.already.title')}
          body={t('apply.already.body', { status: statusLabel(t, myApplication.status) })}
          action={backToProgram}
        />
      );
    }
  }

  const name = meta?.name ?? `Program #${id}`;

  // ── Step content ─────────────────────────────────────────────────────────
  const bioBad = showErrors && form.bio.trim().length < BIO_MIN;
  const essayBad = showErrors && form.essay.trim().length < ESSAY_MIN;
  const scoreBad = (v: string) => showErrors && !isScore(v);

  const scoreInput = (key: 'academic' | 'income' | 'recommend', label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        step={1}
        placeholder="0–100"
        aria-invalid={scoreBad(form[key])}
        className={`w-full ${scoreBad(form[key]) ? '!border-skred' : ''}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );

  const reviewRow = (label: string, value: string, goTo: StepKey) => (
    <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_0_#000]">
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
        <button
          type="button"
          className="text-xs font-bold underline"
          onClick={() => setStepIdx(steps.indexOf(goTo))}
        >
          {t('apply.edit')}
        </button>
      </div>
      <p className={`text-sm whitespace-pre-wrap break-words ${value ? '' : 'text-gray-400'}`}>
        {value || t('apply.notProvided')}
      </p>
    </div>
  );

  const renderStep = () => {
    switch (stepKey) {
      case 'about':
        return (
          <div className="space-y-5">
            <header>
              <h2 className="font-paytone text-2xl">{t('apply.about.title')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('apply.about.hint')}</p>
            </header>
            <Field
              label={t('apply.bio')}
              hint={t('apply.bioHint', { min: BIO_MIN })}
              count={form.bio.trim().length}
              min={BIO_MIN}
            >
              <textarea
                rows={4}
                aria-invalid={bioBad}
                className={`w-full ${bioBad ? '!border-skred' : ''}`}
                value={form.bio}
                onChange={(e) => set('bio', e.target.value)}
              />
            </Field>
            <Field label={t('apply.hackquest')} hint={t('apply.hackquestHint')}>
              <input
                type="text"
                placeholder="user@example.com"
                className="w-full"
                value={form.hackquestId}
                onChange={(e) => set('hackquestId', e.target.value)}
              />
            </Field>
          </div>
        );
      case 'essay':
        return (
          <div className="space-y-5">
            <header>
              <h2 className="font-paytone text-2xl">{t('apply.essay.title')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('apply.essay.hint')}</p>
            </header>
            <Field
              label={t('apply.essay')}
              hint={t('apply.essayHint', { min: ESSAY_MIN })}
              count={form.essay.trim().length}
              min={ESSAY_MIN}
            >
              <textarea
                rows={7}
                aria-invalid={essayBad}
                className={`w-full ${essayBad ? '!border-skred' : ''}`}
                value={form.essay}
                onChange={(e) => set('essay', e.target.value)}
              />
            </Field>
            <Field label={t('apply.docs')} hint={t('apply.docsHint')}>
              <textarea
                rows={3}
                className="w-full"
                value={form.documents}
                onChange={(e) => set('documents', e.target.value)}
              />
            </Field>
            <Field label={t('apply.recommend')} hint={t('apply.recommendHint')}>
              <textarea
                rows={2}
                className="w-full"
                value={form.recommendation}
                onChange={(e) => set('recommendation', e.target.value)}
              />
            </Field>
          </div>
        );
      case 'scores':
        return (
          <div className="space-y-5">
            <header>
              <h2 className="font-paytone text-2xl">{t('apply.scores.title')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('apply.scores.hint')}</p>
            </header>
            <p className="text-xs text-gray-700 bg-skyellow-light p-3 border-2 border-black shadow-[2px_2px_0_0_#000]">
              {t('apply.scoresWarning')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {scoreInput('academic', t('apply.scoreAcademic'), t('apply.scoreAcademicHint'))}
              {scoreInput('income', t('apply.scoreIncome'), t('apply.scoreIncomeHint'))}
              {scoreInput('recommend', t('apply.scoreRecommend'), t('apply.scoreRecommendHint'))}
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="space-y-5">
            <header>
              <h2 className="font-paytone text-2xl">{t('apply.review.title')}</h2>
              <p className="text-sm text-gray-600 mt-1">{t('apply.review.hint')}</p>
            </header>
            <div className="space-y-3">
              {reviewRow(t('apply.bio'), form.bio, 'about')}
              {form.hackquestId && reviewRow(t('apply.hackquest'), form.hackquestId, 'about')}
              {reviewRow(t('apply.essay'), form.essay, 'essay')}
              {reviewRow(t('apply.docs'), form.documents, 'essay')}
              {reviewRow(t('apply.recommend'), form.recommendation, 'essay')}
              {committeeMode ? (
                <p className="text-xs text-gray-700 bg-skpurple-light p-3 border-2 border-black">
                  {t('apply.committeeNote')}
                </p>
              ) : (
                reviewRow(
                  t('apply.scores.title'),
                  `${t('apply.scoreAcademic')}: ${form.academic}\n${t('apply.scoreIncome')}: ${form.income}\n${t('apply.scoreRecommend')}: ${form.recommend}`,
                  'scores',
                )
              )}
            </div>
            {myApplication && (
              <p className="text-xs text-gray-700 bg-skyellow-light p-3 border-2 border-black">
                {t('apply.reapply', { status: statusLabel(t, myApplication.status) })}
              </p>
            )}
            <label className="flex items-start gap-3 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 size-4 !p-0 !shadow-none"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>{t('apply.agree')}</span>
            </label>
          </div>
        );
    }
  };

  // ── Page ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-skyellow relative isolate">
      <div
        className="absolute top-0 right-0 left-0 h-[34vh] bg-skpink"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)' }}
      />
      <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-14">
        <div className="mb-8">
          <Link
            to="/programs/$id"
            params={{ id }}
            className="text-black font-bold text-sm hover:underline inline-block mb-3"
          >
            ← {t('apply.back')}
          </Link>
          <h1 className="font-paytone text-4xl md:text-5xl mt-2 leading-[0.95] text-black drop-shadow-[3px_3px_0_#fff]">
            {t('apply.title')}
          </h1>
          <p className="text-black/70 text-lg md:text-xl mt-2 font-medium">{name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_19rem] gap-6 items-start">
          <div className="min-w-0">
            {phase === 'edit' && <ApplyStepper labels={steps.map((k) => t(STEP_LABEL[k]))} current={stepIdx} onJump={setStepIdx} />}

            <NeoCard fill="cream" hoverable={false}>
              <NeoCardBody>
                {phase === 'uploading' && (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 border-2 border-black bg-skyellow mx-auto animate-pulse mb-4 shadow-[3px_3px_0_0_#000]" />
                    <p className="font-paytone text-xl">{t('apply.uploading')}</p>
                    <p className="text-gray-500 text-sm mt-1">{t('apply.uploadingBody', { done: uploaded, total: 4 })}</p>
                  </div>
                )}

                {phase === 'tx' && (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 border-2 border-black bg-skpurple mx-auto animate-pulse mb-4 shadow-[3px_3px_0_0_#000]" />
                    <p className="font-paytone text-xl">{t('apply.confirmTitle')}</p>
                    <p className="text-gray-500 text-sm mt-1">{t('apply.confirmBody')}</p>
                  </div>
                )}

                {phase === 'done' && (
                  <div className="text-center py-14 space-y-4">
                    <div className="size-14 border-2 border-black bg-skgreen mx-auto flex items-center justify-center text-2xl font-extrabold shadow-[3px_3px_0_0_#000]">
                      ✓
                    </div>
                    <h2 className="font-paytone text-3xl">{t('apply.success.title')}</h2>
                    <p className="text-gray-600 max-w-md mx-auto">{t('apply.success.body')}</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                      <Link to="/programs/$id" params={{ id }}>
                        <NeoButton label={t('apply.viewProgram')} variant="secondary" size="md" />
                      </Link>
                      <Link to="/dashboard">
                        <NeoButton label={t('apply.goDashboard')} variant="primary" size="md" />
                      </Link>
                    </div>
                  </div>
                )}

                {phase === 'edit' && (
                  <div className="space-y-6">
                    {!isConnected && (
                      <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_0_#000] space-y-3">
                        <p className="font-bold">{t('apply.connect.title')}</p>
                        <p className="text-sm text-gray-600">{t('apply.connect.body')}</p>
                        <NeoButton label="Connect Wallet" variant="connect" size="md" />
                      </div>
                    )}

                    {(applyError || uploadFailed) && (
                      <div className="bg-skred-light border-2 border-black p-3 text-sm shadow-[2px_2px_0_0_#000]">
                        <p className="font-bold">{t('apply.err.title')}</p>
                        {applyError ? <ErrorNotice error={applyError} className="mt-2" /> : <p className="text-xs mt-1">{t('error.generic')}</p>}
                      </div>
                    )}

                    {renderStep()}

                    {showErrors && !stepValid(stepKey) && stepKey !== 'review' && (
                      <p className="text-xs font-bold text-skred">{t('apply.fixFields')}</p>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-4 border-t-2 border-black/10">
                      <p className="text-[11px] text-gray-500 hidden sm:block">{t('apply.draftSaved')}</p>
                      <div className="flex gap-2 ml-auto">
                        {stepIdx > 0 && (
                          <NeoButton label={t('apply.prev')} variant="ghost" size="md" onClick={goPrev} />
                        )}
                        {stepKey !== 'review' ? (
                          <NeoButton label={t('apply.next')} variant="primary" size="md" onClick={goNext} />
                        ) : (
                          <NeoButton
                            label={t('apply.submit')}
                            variant="success"
                            size="md"
                            onClick={submit}
                            disabled={!isConnected || !agree}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </NeoCardBody>
            </NeoCard>
          </div>

          <aside className="lg:sticky lg:top-6 order-first lg:order-none">
            <ProgramSummary program={program} name={meta?.name} organization={meta?.organization} />
          </aside>
        </div>
      </div>
    </main>
  );
}
