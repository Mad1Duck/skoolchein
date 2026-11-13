import { useQuery } from '@tanstack/react-query';
import { loadIPFSJson } from '@/lib/ipfs';

export interface TextDoc {
  content?: string;
  hackquestId?: string;
}

/** The text an applicant stored on IPFS (bio, essay, documents). Fetched only when `enabled`. */
export function useApplicationText(cid: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ipfs-json', cid],
    queryFn: () => loadIPFSJson<TextDoc>(cid),
    enabled: enabled && !!cid,
    staleTime: Infinity,
  });
}
