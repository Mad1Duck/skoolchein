import { useEffect, useState } from 'react';
import { NeoButton } from '@/components/ui/NeoButton';
import { useSelectionAddress, useSelectionConfig, useSetSelectionConfig } from '@/lib/contracts/v4/hooks/selection';
import { useT } from '@/lib/i18n';

/**
 * Admin settings for winner selection (ScholarshipSelection.setConfig). Percent in the form,
 * basis points on-chain.
 */
export function AdminSelectionConfig() {
  const { t } = useT();
  const address = useSelectionAddress();
  const { config, isLoading, refetch } = useSelectionConfig();
  const { setConfig, isPending, isSuccess, error } = useSetSelectionConfig();

  const [maxPct, setMaxPct] = useState('100');
  const [defaultPct, setDefaultPct] = useState('30');
  const [capPct, setCapPct] = useState('25');

  useEffect(() => {
    if (!config) return;
    setMaxPct(String(config.maxVoteWeightBps / 100));
    setDefaultPct(String(config.defaultVoteWeightBps / 100));
    setCapPct(String(config.voterCapBps / 100));
  }, [config]);

  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  if (!address) {
    return (
      <Card title={t('admin.sel.title')}>
        <p className="text-sm font-bold text-gray-500">
          {t('admin.sel.notDeployed')}
        </p>
      </Card>
    );
  }
  if (isLoading || !config) return <div className="p-8 text-center font-bold">{t('admin.sel.loading')}</div>;

  const toBps = (v: string) => Math.round((parseFloat(v) || 0) * 100);
  const max = toBps(maxPct);
  const def = toBps(defaultPct);
  const cap = toBps(capPct);
  const invalid = max > 10_000 || cap > 10_000 || def > max;
  const changed =
    max !== config.maxVoteWeightBps || def !== config.defaultVoteWeightBps || cap !== config.voterCapBps;

  return (
    <Card
      title={t('admin.sel.title')}
      action={
        <NeoButton
          label={isPending ? t('common.processing') : t('admin.apply')}
          variant="success"
          className="!rounded-xl"
          onClick={() => setConfig(max, def, cap)}
          loading={isPending}
          disabled={isPending || invalid || !changed}
        />
      }
    >
      <p className="text-xs text-gray-500">
        {t('admin.sel.formula')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label={t('admin.sel.max')} unit="%" value={maxPct} onChange={setMaxPct}
          help={t('admin.sel.maxHelp')} />
        <Field label={t('admin.sel.default')} unit="%" value={defaultPct} onChange={setDefaultPct}
          help={t('admin.sel.defaultHelp')} error={def > max} />
        <Field label={t('admin.sel.cap')} unit="%" value={capPct} onChange={setCapPct}
          help={t('admin.sel.capHelp')} />
      </div>

      {invalid && <p className="text-xs font-bold text-skred">{t('admin.sel.invalid')}</p>}
      {error && <p className="text-xs font-bold text-skred">{t('admin.sel.error')}</p>}
    </Card>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border-2 border-black rounded-2xl shadow-[5px_5px_0_0_#000] overflow-hidden">
      <header className="bg-skyellow flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b-2 border-black">
        <h2 className="font-paytone text-lg">{title}</h2>
        {action}
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label, unit, value, onChange, help, error,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
  error?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold uppercase text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={0} max={100} step="0.01" className={`flex-1 font-data ${error ? '!border-skred' : ''}`}
          value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="text-xs font-bold bg-white px-2 py-1 border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000]">{unit}</span>
      </div>
      <p className="text-[10px] text-gray-400 italic">{help}</p>
    </div>
  );
}
