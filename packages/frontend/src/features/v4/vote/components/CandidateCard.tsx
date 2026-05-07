import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApplicantProfile } from '@/lib/ipfs';
import { useVoteForCandidate } from '@/lib/contracts/write-hooks';
import type { Applicant } from '@/lib/api/types';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { ConfidenceStakeModal } from './ConfidenceStakeModal';

interface CandidateCardProps {
  applicant: Applicant;
  programId: number;
}

export function CandidateCard({ applicant, programId }: CandidateCardProps) {
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
