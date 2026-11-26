import { useState } from 'react';
import { ProgramCardV2 } from './ProgramCardV2';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { effectiveStatus } from '@/lib/programStatus';
import { useT } from '@/lib/i18n';
import type { Program } from '@/lib/api/types';

/** Listed in this order; earlier stages are in the search section above. */
const STAGES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
type Filter = 'ALL' | (typeof STAGES)[number];

/**
 * A full-screen section with every program that got past selection or ended: running, completed and
 * cancelled. Together with the search section above, no program is left off the page.
 */
export function StartedPrograms({ programs, isLoading }: { programs: Program[]; isLoading: boolean }) {
  const { t } = useT();
  const size = useBreakpoint().isLessThan('sm') ? 'small' : 'large';
  const [filter, setFilter] = useState<Filter>('ALL');

  // Running first, then completed, then cancelled; newest first within each.
  const started = STAGES.flatMap((stage) =>
    programs.filter((p) => effectiveStatus(p) === stage).sort((a, b) => b.pid - a.pid),
  );
  const count = (f: Filter) => (f === 'ALL' ? started.length : started.filter((p) => p.status === f).length);
  const shown = filter === 'ALL' ? started : started.filter((p) => p.status === filter);

  return (
    <section id="started-programs" className="relative z-[2] snap-start flex min-h-svh flex-col bg-skbw px-9 py-12 max-sm:px-3">
      <div className="flex flex-col items-start gap-3.5">
        <h2 className="font-paytone text-5xl max-sm:text-[24px]">{t('started.title')}</h2>
        <p className="text-2xl max-sm:text-xs">{t('started.hint')}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(['ALL', ...STAGES] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-xl border-2 border-black px-4 py-2 text-sm font-bold transition-all duration-75 ${
              filter === f ? 'bg-black text-white' : 'bg-white shadow-[3px_3px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_#000]'
            }`}
          >
            {t(`started.filter.${f}`)} <span className="font-data opacity-70">{count(f)}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="w-12 h-12 border-2 border-black bg-skyellow animate-pulse shadow-[3px_3px_0_0_#000]" />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="font-paytone text-2xl">{t('started.emptyTitle')}</p>
          <p className="text-gray-500 text-sm mt-2">{t('started.emptyBody')}</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 content-start gap-5 py-7 sm:px-6 lg:grid-cols-2 lg:gap-[3.75rem] lg:px-12 lg:py-12">
          {shown.map((program) => (
            <ProgramCardV2 key={program.pid} program={program} labelButton={t('tabs.btnDetails')} size={size} />
          ))}
        </div>
      )}
    </section>
  );
}
