import { useState } from 'react';
import { usePrograms } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { ProgramVoteSelector } from '../components/ProgramVoteSelector';
import { CandidateList } from '../components/CandidateList';
import SplitText from '@/components/ui/split-text';
import { NeoButton } from '@/components/ui/NeoButton';

export function VotePage() {
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({ status: 'VOTING' });
  const programs = programsData?.data ?? [];
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);

  const selectedProgram = programs.find((p) => p.pid === selectedProgramId);

  return (
    <main className="relative isolate">
      {/* Hero */}
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center bg-skyellow overflow-hidden px-4 text-center">
        <div className="absolute top-0 left-0 right-0 h-1/2 bg-skpurple" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 85%, 50% 100%, 0 85%)' }} />
        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          <h1 className="font-paytone text-4xl md:text-6xl lg:text-7xl text-white drop-shadow-[4px_4px_0_#000]">
            <SplitText
              text="Help to choose"
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
            who deserves the chance?
          </h2>
          <p className="text-lg md:text-2xl text-gray-700 max-w-2xl mx-auto">
            Your vote isn’t just a click—it’s a chance to change someone’s future.
          </p>
          <NeoButton
            label="Start Voting"
            variant="primary"
            size="lg"
            onClick={() => {
              document.getElementById('active-voting')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      </section>

      {/* Active voting */}
      <section id="active-voting" className="bg-skgreen px-4 md:px-10 py-14">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h2 className="font-paytone text-4xl md:text-5xl mb-3">Scholarships in Voting Phase</h2>
            <p className="text-lg md:text-xl">Cast your vote before the deadline closes.</p>
          </div>

          {loadingPrograms ? (
            <NeoSkeleton lines={3} />
          ) : programs.length === 0 ? (
            <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-12 text-center">
              <p className="font-paytone text-xl mb-2">No Active Votes</p>
              <p className="text-gray-500 text-sm">No programs are currently in the voting phase. Check back later or browse open programs.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-1 space-y-3">
                <h3 className="font-bold text-xs text-gray-500 uppercase tracking-wider">
                  Active Programs
                </h3>
                {programs.map((p) => (
                  <ProgramVoteSelector
                    key={p.pid}
                    program={p}
                    isSelected={p.pid === selectedProgramId}
                    onClick={() => setSelectedProgramId(p.pid)}
                  />
                ))}
              </div>

              <div className="md:col-span-3">
                {!selectedProgram ? (
                  <div className="bg-white border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg p-12 text-center">
                    <p className="font-paytone text-lg mb-1">Select a Program</p>
                    <p className="text-gray-500 text-sm">Choose a program from the list to view candidates and cast your vote.</p>
                  </div>
                ) : (
                  <CandidateList program={selectedProgram} />
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
