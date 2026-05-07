import { useQuery } from '@tanstack/react-query';
import { fetchProgramMeta } from '@/lib/ipfs';
import type { Program } from '@/lib/api/types';

interface ProgramVoteSelectorProps {
  program: Program;
  isSelected: boolean;
  onClick: () => void;
}

export function ProgramVoteSelector({
  program,
  isSelected,
  onClick,
}: ProgramVoteSelectorProps) {
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
