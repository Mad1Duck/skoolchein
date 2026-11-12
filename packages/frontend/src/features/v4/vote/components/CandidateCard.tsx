import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApplicantProfile } from '@/lib/ipfs';
import { useVoteForCandidate } from '@/lib/contracts/write-hooks';
import type { Applicant } from '@/lib/api/types';
import { NeoCard, NeoCardBody } from '@/components/ui/NeoCard';
import { NeoButton } from '@/components/ui/NeoButton';
import { ConfidenceStakeModal } from './ConfidenceStakeModal';
import { useT } from '@/lib/i18n';

interface CandidateCardProps {
  applicant: Applicant;
  programId: number;
  /** Program payment token (`program.token`). Zero address = native. */
  token?: `0x${string}`;
}

export function CandidateCard({ applicant, programId, token }: CandidateCardProps) {
  const { t } = useT();
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
              <div className="w-12 h-12 bg-skpurple border-2 border-black flex-shrink-0 shadow-[2px_2px_0_0_#000]" />
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  {profile?.fullName ?? t('candidate.anonymous')}
                </h3>
                <p className="text-xs text-gray-500 font-mono" title={applicant.wallet}>
                  {applicant.wallet.slice(0, 6)}...{applicant.wallet.slice(-4)}
                </p>
              </div>
            </div>

            {profile?.bio && (
              <p className="text-sm text-gray-700 bg-white p-3 border-2 border-black mb-4 line-clamp-3 shadow-[2px_2px_0_0_#000]">
                "{profile.bio}"
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 text-center mb-4">
              <div className="bg-skyellow-light p-2 border-2 border-black shadow-[2px_2px_0_0_#000]">
                <p className="text-[10px] font-bold uppercase">{t('candidate.screening')}</p>
                <p className="font-paytone text-lg">{applicant.screeningScore}</p>
              </div>
              <div className="bg-skblue-light p-2 border-2 border-black shadow-[2px_2px_0_0_#000]">
                <p className="text-[10px] font-bold uppercase">{t('candidate.total')}</p>
                <p className="font-paytone text-lg">{applicant.totalScore}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <div className="flex-1">
              <NeoButton
                label={isSuccess ? t('candidate.voted') : isPending ? t('candidate.confirming') : t('candidate.vote')}
                variant={isSuccess ? 'success' : 'primary'}
                fullWidth
                disabled={isPending || isSuccess}
                loading={isPending}
                onClick={() => castVote(BigInt(programId), applicant.wallet as `0x${string}`, true)}
              />
            </div>
            <NeoButton label={t('candidate.back')} variant="ghost" onClick={() => setIsStakeModalOpen(true)} />
          </div>
        </NeoCardBody>
      </NeoCard>
      <ConfidenceStakeModal
        isOpen={isStakeModalOpen}
        onClose={() => setIsStakeModalOpen(false)}
        programId={programId}
        candidateWallet={applicant.wallet}
        token={token}
      />
    </>
  );
}
