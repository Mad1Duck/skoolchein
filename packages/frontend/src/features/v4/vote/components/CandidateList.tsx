import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useProgramApplicants, useProgramRecommendations, useProgramVotes } from '@/lib/api/hooks';
import { NeoSkeleton } from '@/components/ui/NeoSkeleton';
import type { Program } from '@/lib/api/types';
import { VotingBoard } from '@/features/v4/programs/components/VotingBoard';
import { VoteModal } from '@/features/v4/programs/components/VoteModal';
import { ConfidenceStakeModal } from './ConfidenceStakeModal';
import { useT } from '@/lib/i18n';

interface CandidateListProps {
  program: Program;
}

export function CandidateList({ program }: CandidateListProps) {
  const { t } = useT();
  const { address } = useAccount();
  const pid = String(program.pid);
  const { data: applicants, isLoading } = useProgramApplicants(pid);
  const votesQ = useProgramVotes(pid);
  const recsQ = useProgramRecommendations(pid);
  const [voteFor, setVoteFor] = useState<`0x${string}` | null>(null);
  const [backFor, setBackFor] = useState<string | null>(null);

  const shortlisted = (applicants ?? [])
    .filter((a) => a.status === 'SHORTLISTED')
    .sort((x, y) => Number(y.totalScore ?? 0) - Number(x.totalScore ?? 0));

  if (isLoading) return <NeoSkeleton lines={6} />;

  if (shortlisted.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>{t('candList.empty')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b-2 border-black pb-4">
        <div>
          <h2 className="font-paytone text-2xl">{t('candList.title')}</h2>
          <p className="text-sm text-gray-600">{t('board.hint')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 font-bold uppercase">{t('candList.target')}</p>
          <p className="font-paytone text-xl">{program.targetWinners}</p>
        </div>
      </div>

      <VotingBoard
        showHeader={false}
        candidates={shortlisted}
        votes={votesQ.data ?? []}
        recommendations={recsQ.data ?? []}
        me={address}
        onVote={(wallet) => setVoteFor(wallet as `0x${string}`)}
        onBack={(wallet) => setBackFor(wallet)}
      />

      {voteFor && (
        <VoteModal
          isOpen
          onClose={() => setVoteFor(null)}
          programId={BigInt(program.pid)}
          candidateAddress={voteFor}
          token={program.token as `0x${string}` | undefined}
        />
      )}
      <ConfidenceStakeModal
        isOpen={backFor !== null}
        onClose={() => setBackFor(null)}
        programId={program.pid}
        candidateWallet={backFor ?? ''}
        token={program.token as `0x${string}` | undefined}
      />
    </div>
  );
}
