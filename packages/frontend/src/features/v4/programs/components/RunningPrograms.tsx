import { ProgramCardV2 } from './ProgramCardV2';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { effectiveStatus } from '@/lib/programStatus';
import { useT } from '@/lib/i18n';
import type { Program } from '@/lib/api/types';

/** A full-screen section listing the programs whose recipients are chosen and being paid. */
export function RunningPrograms({ programs, isLoading }: { programs: Program[]; isLoading: boolean }) {
  const { t } = useT();
  const size = useBreakpoint().isLessThan('sm') ? 'small' : 'large';
  const running = programs.filter((p) => effectiveStatus(p) === 'ACTIVE');

  return (
    <section id="running-programs" className="relative z-[2] snap-start flex min-h-svh flex-col bg-skbw px-9 py-12 max-sm:px-3">
      <div className="flex flex-col items-start gap-3.5">
        <h2 className="font-paytone text-5xl max-sm:text-[24px]">{t('running.title')}</h2>
        <p className="text-2xl max-sm:text-xs">{t('running.hint')}</p>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div className="w-12 h-12 border-2 border-black bg-skyellow animate-pulse shadow-[3px_3px_0_0_#000]" />
        </div>
      ) : running.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="font-paytone text-2xl">{t('running.emptyTitle')}</p>
          <p className="text-gray-500 text-sm mt-2">{t('running.emptyBody')}</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 content-start gap-5 py-7 sm:px-6 lg:grid-cols-2 lg:gap-[3.75rem] lg:px-12 lg:py-12">
          {running.map((program) => (
            <ProgramCardV2 key={program.pid} program={program} labelButton={t('tabs.btnDetails')} size={size} />
          ))}
        </div>
      )}
    </section>
  );
}
