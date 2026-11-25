import { useQuery } from '@tanstack/react-query';
import { useProgram } from '@/lib/api/hooks';
import { fetchProgramMeta } from '@/lib/ipfs';

/** A program's name and record, for rows that only carry its id (dashboard and report cards). */
export function useProgramLabel(pid: number) {
  const { data: program } = useProgram(String(pid));
  const { data: meta } = useQuery({
    queryKey: ['ipfs-meta', program?.metadataCID],
    queryFn: () => fetchProgramMeta(program!.metadataCID),
    enabled: !!program?.metadataCID,
    staleTime: Infinity,
  });
  return { program, name: meta?.name ?? `Program #${pid}` };
}
