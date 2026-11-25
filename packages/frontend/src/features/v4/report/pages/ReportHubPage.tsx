import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { ReportsBoard } from '../components/ReportsBoard';
import { NewReportFlow } from './ReportPage';

type View = 'list' | 'new';

/**
 * The one place for everything about reports. "Reports" lists them (yours, about you, in your
 * programs, and everyone's active ones) and is where a scholar defends; "New report" is the
 * pick-a-program, pick-someone, add-evidence flow.
 */
export function ReportHubPage({ initialView = 'list' }: { initialView?: View }) {
  const { t } = useT();
  const [view, setView] = useState<View>(initialView);

  const tabs: Array<{ key: View; label: string; tone: string }> = [
    { key: 'list', label: t('hub.list'), tone: 'bg-white' },
    { key: 'new', label: t('hub.new'), tone: 'bg-skred text-white' },
  ];

  return (
    <main className="min-h-screen bg-skyellow relative isolate">
      <div
        className="absolute top-0 right-0 left-0 h-[42vh] bg-skred"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)' }}
      />
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-6 py-10">
        <header className="pt-8 mb-6">
          <h1 className="font-paytone text-4xl md:text-6xl mb-3 text-white drop-shadow-[4px_4px_0_#000]">{t('reports.title')}</h1>
          <p className="text-black/80 text-lg md:text-xl max-w-2xl font-medium">{t('hub.lead')}</p>
        </header>

        <div role="tablist" className="mb-8 inline-flex gap-2 rounded-2xl border-2 border-black bg-white/80 p-1.5 shadow-[3px_3px_0_0_#000]">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={view === x.key}
              onClick={() => setView(x.key)}
              className={`rounded-xl px-5 py-2 text-sm font-extrabold uppercase tracking-wider transition-all ${
                view === x.key ? `${x.tone} border-2 border-black shadow-[2px_2px_0_0_#000]` : 'border-2 border-transparent text-gray-700 hover:bg-white'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        {view === 'list' ? <ReportsBoard /> : <NewReportFlow />}
      </div>
    </main>
  );
}
