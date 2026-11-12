import { useEffect, useState } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoSelect } from '@/components/ui/NeoSelect';
import { useProgram } from '@/lib/api/hooks';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import {
  useConfigureProgram,
  useConfigureRecommenders,
  useEffectiveVoteWeight,
  useMilestonePlan,
  useSelectionAddress,
  useSelectionConfig,
} from '@/lib/contracts/v4/hooks/selection';
import { useT } from '@/lib/i18n';
import { toDate } from '@/lib/time';
import { isAddress } from 'viem';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

interface Row {
  share: string; // percent, e.g. "30" or "33.33"
  description: string;
  provider: string;
  externalId: string;
}

const emptyRow = (share = '100'): Row => ({ share, description: '', provider: '', externalId: '' });

/** Percent text -> basis points (two decimals of precision), NaN-safe. */
const toBps = (percent: string) => Math.round((parseFloat(percent) || 0) * 100);

/** Splits 100% across `n` rows; the last row takes the remainder so the total is exactly 100. */
function evenShares(n: number): string[] {
  const base = Math.floor(10_000 / n);
  const shares = Array.from({ length: n }, () => base);
  shares[n - 1] += 10_000 - base * n;
  return shares.map((b) => String(b / 100));
}

/**
 * Creator settings for winner selection: how much donor votes count toward the final score,
 * and the milestone plan every winner receives. Editable until screening ends.
 */
export function ProgramSettingsModal({ isOpen, onClose, programId }: Props) {
  const { t } = useT();
  const selection = useSelectionAddress();
  const { data: program } = useProgram(String(programId));
  const { config } = useSelectionConfig();
  const { weightBps: currentWeight } = useEffectiveVoteWeight(programId);
  const { plan } = useMilestonePlan(programId);
  const { maxMandatory } = useProtocolLimits();
  const { configureProgram, isPending, isSuccess } = useConfigureProgram();
  const { configure: configureRecommenders, isPending: savingRecommenders } = useConfigureRecommenders();
  const [restricted, setRestricted] = useState(false);
  const [recommenderText, setRecommenderText] = useState('');

  const maxPct = (config?.maxVoteWeightBps ?? 10_000) / 100;
  const [weight, setWeight] = useState(30);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [loaded, setLoaded] = useState(false);

  // Start from what is saved on-chain (or the defaults), once, when the modal opens.
  useEffect(() => {
    if (!isOpen) { setLoaded(false); return; }
    if (loaded || currentWeight === undefined || plan === undefined) return;
    setWeight(Math.min(currentWeight / 100, maxPct));
    setRows(
      plan.shareBps.length > 0
        ? plan.shareBps.map((b, i) => ({
            share: String(b / 100),
            description: plan.descriptions[i] ?? '',
            provider: plan.providers[i] ?? '',
            externalId: plan.externalIds[i] ?? '',
          }))
        : [emptyRow()],
    );
    setRestricted(!!program?.recommendersRestricted);
    setLoaded(true);
  }, [isOpen, loaded, currentWeight, plan, maxPct, program?.recommendersRestricted]);

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => (r.length >= maxMandatory ? r : [...r, emptyRow('0')]));
  const remove = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : r));
  const splitEvenly = () => setRows((r) => evenShares(r.length).map((share, i) => ({ ...r[i], share })));

  const totalBps = rows.reduce((sum, r) => sum + toBps(r.share), 0);
  const totalOk = totalBps === 10_000 && rows.every((r) => toBps(r.share) > 0);
  const locked = !!program && !['CREATED', 'APPLICATION_OPEN', 'SCREENING'].includes(program.status);

  // Who may recommend: only for self-scored programs, and only while applications are open.
  const lines = recommenderText.split(/[\s,;]+/).map((l) => l.trim()).filter(Boolean);
  const recommenderListOk = lines.every((l) => isAddress(l));
  const applicationsOpen =
    !!program &&
    ['CREATED', 'APPLICATION_OPEN'].includes(program.status) &&
    Date.now() < (toDate(program.applicationEnd)?.getTime() ?? 0);
  const showRecommenders = program?.screeningMode === 1;
  const saveRecommenders = () => configureRecommenders(BigInt(programId), restricted, lines as `0x${string}`[]);

  const handleSave = () =>
    configureProgram(BigInt(programId), Math.round(weight * 100), {
      shareBps: rows.map((r) => toBps(r.share)),
      descriptions: rows.map((r) => r.description),
      providers: rows.map((r) => r.provider),
      externalIds: rows.map((r) => r.externalId),
    });

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t('settings.title', { id: programId })} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-gray-700">{t('settings.intro')}</p>
        {!selection && <Notice>{t('settings.noContract')}</Notice>}
        {locked && <Notice>{t('settings.locked')}</Notice>}

        {/* Vote weight */}
        <section className="rounded-xl border-2 border-black bg-skpurple-light p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-paytone text-lg">{t('settings.weight')}</h3>
            <span className="font-data text-sm font-bold">
              {t('settings.weightValue', { votes: weight, screening: Math.round((100 - weight) * 100) / 100 })}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={maxPct}
            step={1}
            value={weight}
            disabled={locked}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full accent-skpurple !shadow-none !border-0 !p-0"
          />
          <p className="text-xs text-gray-600">{t('settings.weightHelp', { max: maxPct })}</p>
        </section>

        {/* Milestone plan */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-paytone text-lg">{t('settings.plan')}</h3>
              <p className="text-xs text-gray-600">{t('settings.planHelp')}</p>
            </div>
            <NeoButton label={t('settings.splitEvenly')} variant="secondary" size="sm" className="!rounded-xl" onClick={splitEvenly} disabled={locked} />
          </div>

          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border-2 border-black bg-white p-3">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">#{i + 1} {t('settings.share')}</label>
                    <input type="number" min={0} max={100} step="0.01" className="w-full !py-1.5 !text-sm !rounded-lg" value={r.share} disabled={locked}
                      onChange={(e) => update(i, { share: e.target.value })} />
                  </div>
                  <div className="col-span-12 sm:col-span-4">
                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.description')}</label>
                    <input type="text" className="w-full !py-1.5 !text-sm !rounded-lg" value={r.description} disabled={locked}
                      placeholder={t('winners.descriptionPlaceholder')} onChange={(e) => update(i, { description: e.target.value })} />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.platform')}</label>
                    <NeoSelect size="sm" value={r.provider} disabled={locked} onChange={(v) => update(i, { provider: v })}
                      options={[
                        { value: '', label: t('winners.manual') },
                        { value: 'hackquest', label: 'HackQuest' },
                        { value: 'udemy', label: 'Udemy' },
                      ]} />
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">{t('winners.externalId')}</label>
                    <input type="text" className="w-full !py-1.5 !text-sm !rounded-lg" value={r.externalId} disabled={locked || !r.provider}
                      placeholder={t('winners.externalIdPlaceholder')} onChange={(e) => update(i, { externalId: e.target.value })} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {rows.length > 1 && !locked && (
                      <button type="button" onClick={() => remove(i)} title={t('winners.remove')} className="text-red-500 hover:text-red-700 text-xl leading-none pb-1">×</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <NeoButton label={t('winners.add')} variant="ghost" size="sm" onClick={add} disabled={locked || rows.length >= maxMandatory} />
            <span className={`text-sm font-bold font-data ${totalOk ? 'text-emerald-700' : 'text-skred'}`}>
              {t('settings.total', { total: totalBps / 100 })}
            </span>
          </div>
          {!totalOk && <p className="text-xs font-bold text-skred">{t('settings.totalWrong')}</p>}
        </section>

        {showRecommenders && (
          <section className="space-y-3 rounded-xl border-2 border-black bg-white p-4">
            <div>
              <h3 className="font-paytone text-lg">{t('rec.settings.title')}</h3>
              <p className="text-xs text-gray-600">{t('rec.settings.help')}</p>
            </div>
            {!applicationsOpen && <Notice>{t('rec.settings.locked')}</Notice>}
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
              <input type="checkbox" className="size-4 accent-skpurple !shadow-none" checked={restricted}
                disabled={!applicationsOpen} onChange={(e) => setRestricted(e.target.checked)} />
              {t('rec.settings.restricted')}
            </label>
            {restricted && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-gray-500 block">{t('rec.settings.list')}</label>
                <textarea rows={3} value={recommenderText} disabled={!applicationsOpen}
                  onChange={(e) => setRecommenderText(e.target.value)} placeholder="0x…"
                  className="w-full font-data !text-xs resize-none" />
                {!recommenderListOk && <p className="text-xs font-bold text-skred">{t('rec.settings.invalid')}</p>}
              </div>
            )}
            <NeoButton label={t('rec.settings.save')} variant="secondary" size="sm" className="!rounded-xl"
              loading={savingRecommenders} disabled={savingRecommenders || !applicationsOpen || !selection || !recommenderListOk}
              onClick={saveRecommenders} />
          </section>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('settings.saving') : t('settings.save')}
            variant="primary"
            className="!rounded-xl"
            onClick={handleSave}
            loading={isPending}
            disabled={isPending || !selection || locked || !totalOk || !loaded}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border-2 border-black bg-skred-light px-3 py-2 text-sm font-bold">{children}</p>;
}
