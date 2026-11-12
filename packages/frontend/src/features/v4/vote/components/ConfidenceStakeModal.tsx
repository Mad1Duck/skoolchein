import { ConfidenceStakeModal as StakeModal } from '@/features/v4/programs/components/ConfidenceStakeModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  candidateWallet: string;
  /** Program payment token (`program.token`). Zero address = native. */
  token?: `0x${string}`;
}

/** Thin wrapper kept for CandidateCard's props; the logic lives in the programs/ modal. */
export function ConfidenceStakeModal({ isOpen, onClose, programId, candidateWallet, token }: Props) {
  return (
    <StakeModal
      isOpen={isOpen}
      onClose={onClose}
      programId={BigInt(programId)}
      scholarAddress={candidateWallet as `0x${string}`}
      token={token}
    />
  );
}
