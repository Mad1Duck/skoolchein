import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NeoBadge } from '@/components/ui/NeoBadge';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar } from '@/components/ui/WalletAvatar';
import { CopyableText, truncateMiddle } from '@/components/ui/CopyableText';
import type { Applicant, Recommendation } from '@/lib/api/types';
import { loadIPFSJson } from '@/lib/ipfs';
import { toDate } from '@/lib/time';
import { useT } from '@/lib/i18n';

interface Props {
  applicant: Applicant;
  /** Position by score, 1 = best. */
  rank: number;
  isMe: boolean;
  /** Verified recommendations this applicant received. */
  recommendations: Recommendation[];
  /** Share of all votes this applicant received, in percent (0 when voting has not happened). */
  votePct: number;
  votingOpen: boolean;
  onVote: () => void;
}

interface TextDoc { content?: string; hackquestId?: string }

/** The text an applicant stored on IPFS (bio, essay, documents). Fetched only when the row is open. */
function useApplicationText(cid: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ipfs-json', cid],
    queryFn: () => loadIPFSJson<TextDoc>(cid),
    enabled: enabled && !!cid,
    staleTime: Infinity,
  });
}

/**
 * One applicant. Collapsed it shows who, status and score; opened it shows how the score is made
 * up (recommendations, votes) and everything they wrote. Applications and scores are public, so
 * anyone can read any applicant, not only their own.
 */
export function ApplicantRow({ applicant: a, rank, isMe, recommendations, votePct, votingOpen, onVote }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(isMe);

  const profile = useApplicationText(a.profileCID, open);
  const essay = useApplicationText(a.essayCID, open);
  const docs = useApplicationText(a.documentCID, open);

  const score = Number(a.totalScore ?? 0);
  const recAvg = recommendations.length
    ? Math.round(recommendations.reduce((s, r) => s + r.score, 0) / recommendations.length)
    : 0;
  const applied = toDate(a.createdAt);

  return (
    <div className={isMe ? 'bg-skpurple-light/60' : ''}>
      <div className="flex items-center gap-3 p-4 md:p-5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          <span className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center text-xs font-bold shrink-0">{rank}</span>
          <WalletAvatar address={a.wallet} size={32} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-bold font-data text-sm">
              {truncateMiddle(a.wallet, 6, 4)}
              {isMe && (
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 border-2 border-black rounded-full bg-skyellow">
                  {t('appl.you')}
                </span>
              )}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 w-24 rounded-full border border-black bg-white overflow-hidden">
                <div className="h-full bg-skpurple" style={{ width: `${Math.min(100, score / 10)}%` }} />
              </div>
              <span className="text-[11px] text-gray-500 font-data">{t('appl.scoreOf', { score })}</span>
            </div>
          </div>
          <span className="text-xs font-bold underline shrink-0 hidden sm:inline">{open ? t('appl.hide') : t('appl.show')}</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <NeoBadge status={a.status} />
          {votingOpen && a.status === 'SHORTLISTED' && !isMe && (
            <NeoButton label={t('detail.vote')} variant="primary" size="sm" onClick={onVote} />
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 md:px-5 pb-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label={t('appl.score')} value={t('appl.scoreOf', { score })} />
            <Stat label={t('appl.recommendations')} value={recommendations.length ? `${recommendations.length} · ${recAvg}` : t('appl.recNone')} />
            <Stat label={t('appl.votes')} value={votePct > 0 ? `${votePct.toFixed(1)}%` : '—'} />
            <Stat label={t('appl.attempts', { n: a.retryCount })} value={applied ? applied.toLocaleDateString() : '—'} />
          </div>

          {recommendations.length > 0 && (
            <ul className="rounded-xl border-2 border-black divide-y divide-black/10 bg-white">
              {recommendations.map((r) => (
                <li key={r.recommender} className="flex items-center justify-between gap-3 px-3 py-2">
                  <CopyableText value={r.recommender} display={truncateMiddle(r.recommender, 6, 4)} />
                  <span className="font-data font-bold">{r.score}</span>
                </li>
              ))}
            </ul>
          )}

          <TextSection title={t('appl.about')} cid={a.profileCID} query={profile} extra={profile.data?.hackquestId ? `${t('appl.hackquest')}: ${profile.data.hackquestId}` : undefined} />
          <TextSection title={t('appl.essay')} cid={a.essayCID} query={essay} />
          <TextSection title={t('appl.docs')} cid={a.documentCID} query={docs} />

          <p className="text-[11px] text-gray-500">{t('appl.public')}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-2 border-black bg-white p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="font-data text-sm font-bold mt-1">{value}</p>
    </div>
  );
}

function TextSection({
  title,
  cid,
  query,
  extra,
}: {
  title: string;
  /** Empty when the indexer never recorded where the text is stored. */
  cid: string;
  query: { data?: TextDoc | null; isLoading: boolean; isError: boolean; refetch: () => unknown };
  extra?: string;
}) {
  const { t } = useT();
  return (
    <section className="rounded-xl border-2 border-black bg-white p-4 space-y-2">
      <h4 className="font-paytone text-base">{title}</h4>
      {!cid ? (
        <p className="text-sm text-gray-500">{t('appl.notRecorded')}</p>
      ) : query.isLoading ? (
        <p className="text-sm text-gray-500">{t('appl.loading')}</p>
      ) : query.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-skred font-bold">{t('appl.unavailable')}</p>
          <NeoButton label={t('appl.retry')} variant="secondary" size="sm" className="!rounded-xl" onClick={() => query.refetch()} />
        </div>
      ) : (
        <>
          {extra && <p className="text-xs font-data font-bold text-gray-600">{extra}</p>}
          <p className="text-sm text-gray-800 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {query.data?.content?.trim() || t('appl.empty')}
          </p>
        </>
      )}
    </section>
  );
}
