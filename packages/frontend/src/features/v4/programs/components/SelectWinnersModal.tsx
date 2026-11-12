import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';
import { useProgram, useProgramApplicants, useProgramVotes } from '@/lib/api/hooks';
import {
  useEffectiveVoteWeight,
  useMilestonePlan,
  useRankedShortlist,
  useSelectionAddress,
  useSelectWinners,
} from '@/lib/contracts/v4/hooks/selection';
import { useT } from '@/lib/i18n';
import { toDate } from '@/lib/time';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
}

/**
 * Chooses the winners.
 *
 * Public program: the system does it. rankShortlist() orders the whole shortlist by final score
 * (screening plus the votes' share) and the contract rejects any other order, so this only shows
 * the result and submits it; anyone can run it once voting has ended.
 *
 * Private program: the money is the creator's own, so the creator picks, up to the quota.
 */
export function SelectWinnersModal({ isOpen, onClose, programId }: Props) {
  const { t, tr } = useT();
  const { address } = useAccount();
  const selection = useSelectionAddress();

  const { data: program } = useProgram(String(programId));
  const { data: applicants = [] } = useProgramApplicants(String(programId));
  const { data: votes = [] } = useProgramVotes(isOpen ? String(programId) : '');
  const { weightBps } = useEffectiveVoteWeight(programId);
  const { plan } = useMilestonePlan(programId);

  const isPublic = program?.openDonation ?? true;
  const targetWinners = program?.targetWinners ?? 0;
  const { data: ranked = [] } = useRankedShortlist(programId, isOpen && isPublic);
  const { selectWinners, isPending, isSuccess } = useSelectWinners();

  const isCreator = !!address && !!program && address.toLowerCase() === program.initiator.toLowerCase();
  const votingEnd = toDate(program?.votingEnd);
  const tooEarly = isPublic && !!votingEnd && Date.now() < votingEnd.getTime();
  const creatorOnly = !isPublic && !isCreator;

  // Votes received per candidate, as a share of all votes.
  const voteShare = useMemo(() => {
    const per = new Map<string, bigint>();
    let total = 0n;
    for (const v of votes) {
      const w = BigInt(v.votingWeight || '0');
      per.set(v.candidateAddress.toLowerCase(), (per.get(v.candidateAddress.toLowerCase()) ?? 0n) + w);
      total += w;
    }
    return (wallet: string) => (total > 0n ? Number(((per.get(wallet.toLowerCase()) ?? 0n) * 1000n) / total) / 10 : 0);
  }, [votes]);

  const scoreOf = useMemo(() => new Map(applicants.map((a) => [a.wallet.toLowerCase(), Number(a.screeningScore)])), [applicants]);

  // Private programs: the creator's own picks.
  const shortlisted = useMemo(() => applicants.filter((a) => a.status === 'SHORTLISTED'), [applicants]);
  const [picked, setPicked] = useState<`0x${string}`[]>([]);
  useEffect(() => { if (!isOpen) setPicked([]); }, [isOpen]);
  const toggle = (w: `0x${string}`) =>
    setPicked((p) => (p.includes(w) ? p.filter((x) => x !== w) : p.length < targetWinners ? [...p, w] : p));

  useEffect(() => {
    if (isSuccess) onClose();
  }, [isSuccess, onClose]);

  const handleConfirm = () => selectWinners(BigInt(programId), isPublic ? ranked : picked);

  const winnerCount = isPublic ? Math.min(targetWinners, ranked.length) : picked.length;
  const blocked =
    !selection || !program || tooEarly || creatorOnly || winnerCount === 0;

  return (
    <NeoModal isOpen={isOpen} onClose={onClose} title={t('winners.title', { id: programId })}>
      <div className="space-y-4">
        <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-sm space-y-1.5">
          <p className="text-gray-700">
            {isPublic
              ? t('winners.introPublic', { weight: (weightBps ?? 0) / 100 })
              : t('winners.introPrivate', { max: targetWinners })}
          </p>
          <p className="text-xs font-bold text-gray-600">{t('winners.planNote', { count: plan?.shareBps.length || 1 })}</p>
        </div>

        {!selection && <Notice>{t('winners.noContract')}</Notice>}
        {selection && tooEarly && votingEnd && <Notice>{t('winners.notEnded', { date: votingEnd.toLocaleString() })}</Notice>}
        {selection && creatorOnly && <Notice>{t('winners.creatorOnly')}</Notice>}

        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {isPublic
            ? ranked.map((wallet, i) => {
                const win = i < targetWinners;
                return (
                  <Row
                    key={wallet}
                    rank={i + 1}
                    wallet={wallet}
                    highlight={win}
                    detail={
                      <>
                        {t('winners.screening')} <b className="font-data">{scoreOf.get(wallet.toLowerCase()) ?? '—'}</b>
                        {' · '}
                        {t('winners.votes')} <b className="font-data">{voteShare(wallet).toFixed(1)}%</b>
                      </>
                    }
                    tag={win ? t('winners.winner') : t('winners.notSelected')}
                    tagOn={win}
                  />
                );
              })
            : shortlisted.map((a, i) => {
                const wallet = a.wallet as `0x${string}`;
                const on = picked.includes(wallet);
                return (
                  <button key={wallet} type="button" onClick={() => toggle(wallet)} disabled={creatorOnly} className="block w-full text-left">
                    <Row
                      rank={i + 1}
                      wallet={wallet}
                      highlight={on}
                      detail={<>{t('winners.screening')} <b className="font-data">{a.screeningScore}</b></>}
                      tag={on ? t('winners.winner') : t('winners.notSelected')}
                      tagOn={on}
                    />
                  </button>
                );
              })}

          {(isPublic ? ranked.length === 0 : shortlisted.length === 0) && (
            <p className="text-center py-8 text-gray-500">{t('winners.empty')}</p>
          )}
        </div>

        {!isPublic && (
          <p className="text-xs font-bold text-gray-600">{tr('winners.pick', { count: picked.length, max: targetWinners })}</p>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={onClose} disabled={isPending} fullWidth />
          <NeoButton
            label={isPending ? t('winners.selecting') : !program ? t('winners.loadingProgram') : t('winners.confirm', { count: winnerCount })}
            variant="success"
            className="!rounded-xl"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending || blocked}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}

function Row({
  rank, wallet, detail, tag, tagOn, highlight,
}: {
  rank: number;
  wallet: string;
  detail: React.ReactNode;
  tag: string;
  tagOn: boolean;
  highlight: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-black ${highlight ? 'bg-skgreen' : 'bg-white'}`}>
      <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center text-xs font-bold shrink-0">{rank}</div>
      <WalletAvatar address={wallet} size={28} />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm font-data truncate">{shortenAddress(wallet)}</p>
        <p className="text-xs text-gray-600">{detail}</p>
      </div>
      <span
        className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 border-2 border-black rounded-full ${
          tagOn ? 'bg-white' : 'bg-gray-200 text-gray-600'
        }`}
      >
        {tag}
      </span>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border-2 border-black bg-skred-light px-3 py-2 text-sm font-bold">{children}</p>;
}
