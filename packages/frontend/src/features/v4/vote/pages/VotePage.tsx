import { useState } from 'react';
import { usePrograms } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { ProgramVoteSelector } from '../components/ProgramVoteSelector';
import { CandidateList } from '../components/CandidateList';

export function VotePage() {
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({ status: 'VOTING' });
  const programs = programsData?.data ?? [];
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">
      <div className="mb-6">
        <h1 className="font-paytone text-3xl md:text-4xl mb-2">Vote for Candidates</h1>
        <p className="text-gray-600 text-base md:text-lg">
          Use your voting power to select the next generation of scholars.
        </p>
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
                key={p.id}
                program={p}
                isSelected={p.id === selectedProgramId}
                onClick={() => setSelectedProgramId(p.id)}
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
  );
}
