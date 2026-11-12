import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useAddCommitteeMember, useRemoveCommitteeMember } from '@/lib/contracts/write-hooks';
import { committeeGovernanceAbi } from '@/constants/contractsV4';
import { useV4Addresses } from '@/lib/chain/useActiveChain';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

export function CommitteeManagementModal({ isOpen, onClose, programId }: Props) {
  const v4Addresses = useV4Addresses();
  const [newMember, setNewMember] = useState('');

  const { data: membersRaw, refetch } = useReadContract({
    address: v4Addresses.CommitteeGovernance as `0x${string}`,
    abi: committeeGovernanceAbi,
    functionName: 'getCommitteeMembers',
    args: [BigInt(programId)],
    query: { enabled: isOpen && programId > 0 },
  });

  const members = (membersRaw as `0x${string}`[] | undefined) ?? [];

  const { addMember, isPending: isAdding, isSuccess: added } = useAddCommitteeMember();
  const { removeMember, isPending: isRemoving } = useRemoveCommitteeMember();

  const handleAdd = () => {
    if (!newMember) return;
    addMember(BigInt(programId), newMember as `0x${string}`);
  };

  const handleRemove = (member: `0x${string}`) => {
    removeMember(BigInt(programId), member);
  };

  // Refetch after add success
  if (added) refetch();

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={`Manage Committee — Program #${programId}`}>
      <div className="space-y-5">
        {/* Current Members */}
        <div>
          <h3 className="font-bold text-sm mb-3 uppercase tracking-wide text-gray-500">
            Current Members ({members.length})
          </h3>
          {members.length === 0 ? (
            <div className="border-2 border-dashed border-gray-400 p-6 text-center text-gray-500 text-sm">
              No committee members yet. Add the first member below.
            </div>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li
                  key={m}
                  className="flex items-center justify-between bg-white border-2 border-black p-3 shadow-[2px_2px_0_0_#000]"
                >
                  <div className="flex items-center gap-3">
                    <WalletAvatar address={m} size={28} />
                    <span className="font-mono text-sm">{shortenAddress(m)}</span>
                  </div>
                  <NeoButton
                    label="Remove"
                    variant="danger"
                    size="sm"
                    loading={isRemoving}
                    disabled={isRemoving}
                    onClick={() => handleRemove(m)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add Member */}
        <div className="bg-skpurple-light border-2 border-black p-4 space-y-3 shadow-[3px_3px_0_0_#000]">
          <h3 className="font-bold text-sm">Add Committee Member</h3>
          <p className="text-xs text-gray-600">
            Maximum 15 members allowed. Members cannot be the program initiator.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x... wallet address"
              className="flex-1 font-data text-sm"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
            />
            <NeoButton
              label={isAdding ? 'Adding…' : 'Add'}
              variant="primary"
              loading={isAdding}
              disabled={isAdding || !newMember || newMember.length !== 42}
              onClick={handleAdd}
            />
          </div>
        </div>

        <div className="pt-2 border-t-2 border-gray-100">
          <NeoButton label="Done" variant="ghost" onClick={onClose} fullWidth />
        </div>
      </div>
    </NeoModal>
  );
}
