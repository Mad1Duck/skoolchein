import { useQuery } from '@tanstack/react-query';
import { formatBytes, ipfsUrl, loadIPFSJson, type EvidenceDoc } from '@/lib/ipfs';
import { useT } from '@/lib/i18n';

/** A marker the contract accepted instead of a stored document. */
const isDocument = (cid: string) => !!cid && !/^(NO_PROOF_REQUIRED|AUTO_VERIFIED)/.test(cid);

/**
 * Shows an evidence document: what was written, and every attached file as a link (images get a
 * preview). Anyone who has to judge a proof, report or defense reads it through this, so nobody
 * decides from a bare CID.
 */
export function EvidenceView({ cid, empty }: { cid: string; empty?: string }) {
  const { t } = useT();
  const real = isDocument(cid);
  const q = useQuery({
    queryKey: ['ipfs-json', cid],
    queryFn: () => loadIPFSJson<EvidenceDoc>(cid),
    enabled: real,
    staleTime: Infinity,
  });

  if (!real) return <p className="text-sm text-gray-600">{empty ?? t('evidence.none')}</p>;
  if (q.isLoading) return <p className="text-sm text-gray-500">{t('appl.loading')}</p>;
  if (q.isError) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-bold text-skred">{t('appl.unavailable')}</p>
        <button type="button" className="text-xs font-bold underline" onClick={() => q.refetch()}>{t('appl.retry')}</button>
      </div>
    );
  }

  const text = q.data?.content?.trim();
  const files = q.data?.files ?? [];
  if (!text && files.length === 0) return <p className="text-sm text-gray-600">{empty ?? t('evidence.none')}</p>;

  return (
    <div className="space-y-2">
      {text && <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>}
      {files.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {files.map((f) => (
            <li key={f.cid} className="rounded-lg border-2 border-black bg-white p-2 text-xs">
              {f.type.startsWith('image/') && (
                <a href={ipfsUrl(f.cid)} target="_blank" rel="noreferrer">
                  <img src={ipfsUrl(f.cid)} alt={f.name} loading="lazy" className="mb-2 max-h-40 w-full rounded border border-black object-cover" />
                </a>
              )}
              <a href={ipfsUrl(f.cid)} target="_blank" rel="noreferrer" className="block truncate font-bold underline" title={f.name}>
                📎 {f.name}
              </a>
              <span className="font-data text-gray-500">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
