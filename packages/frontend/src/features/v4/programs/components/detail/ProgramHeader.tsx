import { useAccount } from 'wagmi';
import { Link } from '@tanstack/react-router';
import { useToggleOpenDonation } from '@/lib/contracts/write-hooks';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import type { Program, ProgramMetadata } from '@/lib/api/types';

interface ProgramHeaderProps {
  program: Program;
  meta?: ProgramMetadata;
  onDonate: () => void;
  onSelectWinners: () => void;
  onTabChange: (tab: string) => void;
}

export function ProgramHeader({
  program,
  meta,
  onDonate,
  onSelectWinners,
  onTabChange,
}: ProgramHeaderProps) {
  const { address: userAddress } = useAccount();
  const { toggle, isPending: isToggling } = useToggleOpenDonation();

  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="font-paytone text-3xl md:text-4xl">
            {meta?.name ?? `Program #${program.pid}`}
          </h1>
          <NeoBadge status={program.status} />
        </div>
        {meta?.description && (
          <p className="text-gray-600 text-lg max-w-2xl">{meta.description}</p>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <WalletAvatar address={program.initiator} size={20} />
          <span className="font-mono">{shortenAddress(program.initiator)}</span>
          {meta?.organization && <span>• {meta.organization}</span>}
        </div>
      </div>
      <div className="flex gap-2 shrink-0">
        {userAddress === program.initiator && (
          <div className="flex items-center gap-2 bg-white border-2 border-black px-3 py-1 shadow-[2px_2px_0_0_#000]">
            <span className="text-[10px] font-bold uppercase">Public:</span>
            <button
              disabled={isToggling}
              onClick={() => toggle(BigInt(program.pid), !program.openDonation)}
              className={`w-10 h-5 border-2 border-black relative transition-colors ${program.openDonation ? 'bg-skgreen' : 'bg-gray-400'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white border border-black transition-all ${program.openDonation ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>
        )}
        {program.status === 'APPLICATION_OPEN' && (
          <Link to="/apply/$id" params={{ id: String(program.pid) }}>
            <NeoButton label="Apply Now" variant="primary" size="md" />
          </Link>
        )}
        {program.status === 'VOTING' && program.openDonation && (
          <NeoButton 
            label="Cast Vote" 
            variant="primary" 
            size="md" 
            onClick={() => onTabChange('applicants')} 
          />
        )}
        {program.openDonation && (
          <NeoButton
            label="Donate"
            variant="success"
            size="md"
            onClick={onDonate}
          />
        )}
        {userAddress === program.initiator && program.status === 'VOTING' && (
          <NeoButton
            label="Select Winners"
            variant="success"
            size="md"
            onClick={onSelectWinners}
          />
        )}
      </div>
    </div>
  );
}
