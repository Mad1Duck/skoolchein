import { useState } from 'react';
import { usePrograms, useProgramApplicants } from '@/lib/api/hooks';
import { fetchApplicantProfile, fetchProgramMeta } from '@/lib/ipfs';
import { useVoteForCandidate } from '@/lib/contracts/write-hooks';
import { useQuery } from '@tanstack/react-query';
import type { Program, Applicant } from '@/lib/api/types';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import { ConfidenceStakeModal } from '../components/ConfidenceStakeModal';

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

function ProgramVoteSelector({
  program,
  isSelected,
  onClick,
}: {
  program: Program;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program.metadataCID],
    queryFn: () => fetchProgramMeta(program.metadataCID),
    enabled: !!program.metadataCID,
    staleTime: Infinity,
  });

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        isSelected
          ? 'border-black bg-skpink text-black translate-x-1'
          : 'border-gray-200 bg-white hover:border-black hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0)]'
      }`}>
      <div className="font-bold">{meta?.name ?? `Program #${program.id}`}</div>
      <div className="text-xs mt-1 opacity-80">{program.shortlistedCount} shortlisted</div>
    </button>
  );
}

function CandidateList({ program }: { program: Program }) {
  const { data: applicants, isLoading } = useProgramApplicants(program.id);
  const shortlisted = applicants?.filter((a) => a.status === 'SHORTLISTED') || [];

  if (isLoading) return <NeoSkeleton lines={6} />;

  if (shortlisted.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No shortlisted candidates found for this program.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b-2 border-black pb-4">
        <div>
          <h2 className="font-paytone text-2xl">Shortlisted Candidates</h2>
          <p className="text-sm text-gray-600">
            Select the candidate you believe is most deserving.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-bold uppercase">Target Winners</p>
          <p className="font-paytone text-xl text-skblue">{program.targetWinners}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shortlisted.map((applicant) => (
          <CandidateCard key={applicant.id} applicant={applicant} programId={program.pid} />
        ))}
      </div>
    </div>
  );
}

function CandidateCard({ applicant, programId }: { applicant: Applicant; programId: number }) {
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const { data: profile } = useQuery({
    queryKey: ['applicant-profile', applicant.profileCID],
    queryFn: () => fetchApplicantProfile(applicant.profileCID),
    enabled: !!applicant.profileCID,
  });

  const { vote: castVote, isPending, isSuccess } = useVoteForCandidate();

  return (
    <>
      <NeoCard>
        <NeoCardBody className="flex flex-col h-full">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-skpurple to-skyellow border-2 border-black flex-shrink-0" />
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  {profile?.fullName ?? 'Anonymous Student'}
                </h3>
                <p className="text-xs text-gray-500 font-mono" title={applicant.wallet}>
                  {applicant.wallet.slice(0, 6)}...{applicant.wallet.slice(-4)}
                </p>
              </div>
            </div>

            {profile?.bio && (
              <p className="text-sm text-gray-700 bg-gray-50 p-3 border-2 border-black rounded-lg mb-4 line-clamp-3">
                "{profile.bio}"
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-center mb-4">
              <div className="bg-skyellow-light p-2 rounded border border-black">
                <p className="text-[10px] font-bold uppercase">Screening</p>
                <p className="font-paytone text-lg">{applicant.screeningScore}</p>
              </div>
              <div className="bg-skblue-light p-2 rounded border border-black">
                <p className="text-[10px] font-bold uppercase">Total</p>
                <p className="font-paytone text-lg">{applicant.totalScore}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <div className="flex-1">
              <NeoButton
                label={isSuccess ? 'Voted!' : isPending ? 'Confirming...' : 'Cast Vote'}
                variant={isSuccess ? 'success' : 'primary'}
                fullWidth
                disabled={isPending || isSuccess}
                loading={isPending}
                onClick={() => castVote(BigInt(programId), applicant.wallet as `0x${string}`, true)}
              />
            </div>
            <NeoButton label="Stake" variant="ghost" onClick={() => setIsStakeModalOpen(true)} />
          </div>
        </NeoCardBody>
      </NeoCard>
      <ConfidenceStakeModal
        isOpen={isStakeModalOpen}
        onClose={() => setIsStakeModalOpen(false)}
        programId={programId}
        candidateWallet={applicant.wallet}
      />
    </>
  );
}
