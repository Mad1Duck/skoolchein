import { useState } from 'react';
import { usePrograms } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { ProgramVoteSelector } from '../components/ProgramVoteSelector';
import { VoteProgramHeader } from '../components/VoteProgramHeader';
import { CandidateList } from '../components/CandidateList';
import SplitText from '@/components/ui/split-text';
import { NeoButton } from '@/components/ui/NeoButton';
import { useT } from '@/lib/i18n';
import { toDate } from '@/lib/time';
import { useVotingClock } from '../useVotingClock';

export function VotePage() {
  const { t } = useT();
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({ status: 'VOTING' });
  const programs = programsData?.data ?? [];
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);

  // The first program is open by default, so the page never starts on an empty "pick one" panel.
  const selectedProgram = programs.find((p) => p.pid === selectedProgramId) ?? programs[0];

  // The voting window that closes first, since that is the one a visitor should look at first.
  const soonest = programs
    .map((p) => p.votingEnd)
    .filter((v): v is string => !!v)
    .sort((a, b) => (toDate(a)?.getTime() ?? 0) - (toDate(b)?.getTime() ?? 0))[0];
  const soonestClock = useVotingClock(soonest);
  const candidates = programs.reduce((sum, p) => sum + (p.shortlistedCount ?? 0), 0);

  return (
    <main className="relative isolate">
      {/* Hero */}
      <section className="relative min-h-[60vh] flex flex-col items-center justify-center bg-skyellow overflow-hidden px-4 pb-24 text-center">
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-skpurple" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 85%, 50% 100%, 0 85%)' }} />
        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          <h1 className="font-paytone text-4xl md:text-6xl lg:text-7xl text-white drop-shadow-[4px_4px_0_#000]">
            <SplitText
              text={t('votePage.h1')}
              delay={120}
              duration={0.5}
              ease="power3.out"
              splitType="words"
              from={{ opacity: 0, y: 30 }}
              to={{ opacity: 1, y: 0 }}
              textAlign="center"
            />
          </h1>
          <h2 className="font-paytone text-3xl md:text-5xl text-black drop-shadow-[3px_3px_0_#fff]">
            {t('votePage.h2')}
          </h2>
          <p className="text-lg md:text-2xl text-gray-700 max-w-2xl mx-auto">
            {t('votePage.lead')}
          </p>
          <NeoButton
            label={t('votePage.start')}
            variant="primary"
            size="lg"
            onClick={() => {
              document.getElementById('active-voting')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      </section>

      {/* Live numbers, overlapping the hero edge */}
      <div className="relative z-20 -mt-14 px-4 md:px-10">
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label={t('votePage.statPrograms')} value={loadingPrograms ? '…' : String(programs.length)} />
          <Stat label={t('votePage.statCandidates')} value={loadingPrograms ? '…' : String(candidates)} />
          <Stat
            label={t('votePage.statEnds')}
            value={soonestClock.text ?? '—'}
            tone="bg-skpink"
          />
        </div>
      </div>

      {/* Active voting */}
      <section id="active-voting" className="bg-skgreen px-4 md:px-10 py-14 -mt-10 pt-24">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="font-paytone text-4xl md:text-5xl mb-3">{t('votePage.phase')}</h2>
            <p className="text-lg md:text-xl">{t('votePage.deadline')}</p>
          </div>

          {loadingPrograms ? (
            <NeoSkeleton lines={3} />
          ) : programs.length === 0 ? (
            <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-12 text-center">
              <p className="font-paytone text-xl mb-2">{t('votePage.emptyTitle')}</p>
              <p className="text-gray-500 text-sm">{t('votePage.emptyBody')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)] gap-6 items-start">
              <aside className="space-y-3 lg:sticky lg:top-24">
                <h3 className="font-bold text-xs text-gray-600 uppercase tracking-wider">
                  {t('votePage.active')}
                </h3>
                {programs.map((p) => (
                  <ProgramVoteSelector
                    key={p.pid}
                    program={p}
                    isSelected={p.pid === selectedProgram?.pid}
                    onClick={() => setSelectedProgramId(p.pid)}
                  />
                ))}
              </aside>

              <div className="min-w-0 space-y-6">
                {selectedProgram && (
                  <>
                    <VoteProgramHeader program={selectedProgram} />
                    <CandidateList program={selectedProgram} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, tone = 'bg-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`${tone} rounded-2xl border-2 border-black p-4 shadow-[4px_4px_0_0_#000]`}>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-600">{label}</p>
      <p className="font-paytone text-3xl mt-1 [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}
