import { useState } from 'react';
import { usePrograms } from '@/lib/api/hooks';
import { NeoCard } from '@/components/ui/NeoCard';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { ProgramVoteSelector } from '../components/ProgramVoteSelector';
import { CandidateList } from '../components/CandidateList';

export function VotePage() {
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({ status: 'VOTING' });
  const programs = programsData?.data ?? [];
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);

  const selectedProgram = programs.find((p) => p.id === selectedProgramId);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="font-paytone text-4xl mb-2">Vote for Candidates</h1>
        <p className="text-gray-600 text-lg">
          Use your voting power to select the next generation of scholars.
        </p>
      </div>

      {loadingPrograms ? (
        <NeoSkeleton lines={3} />
      ) : programs.length === 0 ? (
        <NeoCard className="p-8 text-center text-gray-500">
          <p className="text-4xl mb-4">📭</p>
          <p>No programs are currently in the voting phase.</p>
        </NeoCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar: Programs in Voting */}
          <div className="md:col-span-1 space-y-4">
            <h3 className="font-bold text-sm text-gray-500 uppercase tracking-wide">
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

          {/* Main Area: Candidates */}
          <div className="md:col-span-3">
            {!selectedProgram ? (
              <div className="p-12 text-center text-gray-500 border-2 border-dashed border-gray-300 rounded-xl">
                <p>Select a program from the left to view candidates.</p>
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
