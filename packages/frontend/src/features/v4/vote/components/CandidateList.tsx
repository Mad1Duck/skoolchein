import { useProgramApplicants } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import type { Program } from '@/lib/api/types';
import { CandidateCard } from './CandidateCard';

interface CandidateListProps {
  program: Program;
}

export function CandidateList({ program }: CandidateListProps) {
  const { data: applicants, isLoading } = useProgramApplicants(String(program.pid));
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
          <CandidateCard key={applicant.wallet} applicant={applicant} programId={program.pid} token={program.token as `0x${string}` | undefined} />
        ))}
      </div>
    </div>
  );
}
