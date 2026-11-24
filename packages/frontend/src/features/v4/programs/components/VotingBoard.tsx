import { useEffect, useRef, useState } from 'react';
import type { Applicant, Recommendation, Vote } from '@/lib/api/types';
import { WalletAvatar } from '@/components/ui/WalletAvatar';
import { CopyableText, truncateMiddle } from '@/components/ui/CopyableText';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import { useT } from '@/lib/i18n';
import { useConfidenceStakes } from '@/lib/api/hooks';
import { formatTokenWithSymbol } from '@/lib/contracts/v4/token';
import { useApplicationText } from './useApplicationText';

interface Props {
  /** Shortlisted candidates only. */
  candidates: Applicant[];
  votes: Vote[];
  recommendations: Recommendation[];
  /** The connected wallet, if any. */
  me?: string;
  onVote: (wallet: string) => void;
  /** Optional second action next to Vote (backing a candidate with a confidence stake). */
  onBack?: (wallet: string) => void;
  /** Set to false when the page already has its own heading. */
  showHeader?: boolean;
  /** With these, every card also shows the vote weight and the backing deposits collected for it. */
  pid?: number;
  /** Program payment token (zero address = native). */
  token?: string;
}

/** Header colours, cycled by position so neighbouring cards never match. */
const HEADERS = ['bg-skyellow', 'bg-skpink', 'bg-skgreen', 'bg-skcyan'] as const;

interface Tally {
  voters: number;
  weight: bigint;
}

/**
 * The candidates people can vote for, as a board: whoever leads is marked, every card shows its
 * vote count and share, and a "+1" pops up when a new vote arrives. The screening score and the
 * recommendations stay visible next to the votes, since the votes only add to that score.
 */
export function VotingBoard({ candidates, votes, recommendations, me, onVote, onBack, showHeader = true, pid, token }: Props) {
  const { t } = useT();
  const { scoreMax } = useProtocolLimits();
  const stakesQ = useConfidenceStakes();

  // Backing deposits per candidate (only for this program).
  const stakes = new Map<string, { backers: number; amount: bigint; mine: bigint }>();
  for (const s of stakesQ.data ?? []) {
    if (pid === undefined || s.pid !== pid) continue;
    const key = s.scholarAddress.toLowerCase();
    const cur = stakes.get(key) ?? { backers: 0, amount: 0n, mine: 0n };
    const amount = BigInt(s.amount || '0');
    stakes.set(key, {
      backers: cur.backers + 1,
      amount: cur.amount + amount,
      mine: me && s.voterAddress.toLowerCase() === me.toLowerCase() ? cur.mine + amount : cur.mine,
    });
  }
  const hasStaked = [...stakes.values()].some((s) => s.mine > 0n);
  const money = (v: bigint) => formatTokenWithSymbol(v, token);
  const myWeight = new Map<string, bigint>();
  for (const v of votes) {
    if (me && v.voterAddress.toLowerCase() === me.toLowerCase()) myWeight.set(v.candidateAddress.toLowerCase(), BigInt(v.votingWeight || '0'));
  }

  const tally = new Map<string, Tally>();
  let totalWeight = 0n;
  for (const v of votes) {
    const key = v.candidateAddress.toLowerCase();
    const w = BigInt(v.votingWeight || '0');
    const cur = tally.get(key) ?? { voters: 0, weight: 0n };
    tally.set(key, { voters: cur.voters + 1, weight: cur.weight + w });
    totalWeight += w;
  }
  const myVotes = new Set(
    votes.filter((v) => me && v.voterAddress.toLowerCase() === me.toLowerCase()).map((v) => v.candidateAddress.toLowerCase()),
  );

  const board = [...candidates]
    .map((a) => ({ a, tally: tally.get(a.wallet.toLowerCase()) ?? { voters: 0, weight: 0n } }))
    .sort((x, y) => {
      if (y.tally.weight !== x.tally.weight) return y.tally.weight > x.tally.weight ? 1 : -1;
      return Number(y.a.totalScore ?? 0) - Number(x.a.totalScore ?? 0);
    });
  const topWeight = board[0]?.tally.weight ?? 0n;

  if (board.length === 0) {
    return <p className="text-center py-10 text-gray-500">{t('board.empty')}</p>;
  }

  return (
    <section className="space-y-4">
      {showHeader && (
        <div>
          <h3 className="font-paytone text-2xl">{t('board.title')}</h3>
          <p className="text-sm text-gray-600">{t('board.hint')}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {board.map(({ a, tally: tl }, i) => {
          const wallet = a.wallet;
          const share = totalWeight > 0n ? Number((tl.weight * 1000n) / totalWeight) / 10 : 0;
          const recs = recommendations.filter((r) => r.student.toLowerCase() === wallet.toLowerCase());
          return (
            <CandidateCard
              key={wallet}
              applicant={a}
              header={HEADERS[i % HEADERS.length]}
              leading={topWeight > 0n && tl.weight === topWeight}
              voters={tl.voters}
              share={share}
              recCount={recs.length}
              recAvg={recs.length ? Math.round(recs.reduce((s, r) => s + r.score, 0) / recs.length) : 0}
              scoreMax={scoreMax}
              isMe={!!me && wallet.toLowerCase() === me.toLowerCase()}
              voted={myVotes.has(wallet.toLowerCase())}
              usedVote={myVotes.size > 0}
              hasStaked={hasStaked}
              weightText={pid !== undefined ? money(tl.weight) : undefined}
              myWeightText={myWeight.has(wallet.toLowerCase()) ? money(myWeight.get(wallet.toLowerCase())!) : undefined}
              stakeInfo={pid !== undefined ? stakes.get(wallet.toLowerCase()) : undefined}
              money={money}
              onVote={() => onVote(wallet)}
              onBack={onBack ? () => onBack(wallet) : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

function CandidateCard({
  applicant: a,
  header,
  leading,
  voters,
  share,
  recCount,
  recAvg,
  scoreMax,
  isMe,
  voted,
  usedVote,
  hasStaked,
  weightText,
  myWeightText,
  stakeInfo,
  money,
  onVote,
  onBack,
}: {
  /** This wallet already put a backing deposit on someone in this program (one per program). */
  hasStaked: boolean;
  /** This wallet has already voted for someone in the program. */
  usedVote: boolean;
  weightText?: string;
  myWeightText?: string;
  stakeInfo?: { backers: number; amount: bigint; mine: bigint };
  money: (v: bigint) => string;
  applicant: Applicant;
  header: string;
  leading: boolean;
  voters: number;
  share: number;
  recCount: number;
  recAvg: number;
  scoreMax: number;
  isMe: boolean;
  voted: boolean;
  onVote: () => void;
  onBack?: () => void;
}) {
  const { t } = useT();
  const profile = useApplicationText(a.profileCID, true);
  const bio = profile.data?.content?.trim();
  const score = Number(a.totalScore ?? 0);

  // "+N" above the count whenever new votes arrive, for a couple of seconds.
  const previous = useRef(voters);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (voters > previous.current) {
      setBump(voters - previous.current);
      const timer = setTimeout(() => setBump(0), 2400);
      previous.current = voters;
      return () => clearTimeout(timer);
    }
    previous.current = voters;
  }, [voters]);

  return (
    <article className="relative rounded-2xl border-2 border-black bg-white shadow-[5px_5px_0_0_#000] overflow-visible">
      {leading && (
        <span className="absolute -top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full border-2 border-black bg-skyellow px-3 py-1 text-xs font-extrabold uppercase tracking-wider shadow-[2px_2px_0_0_#000]">
          <span aria-hidden>👑</span> {t('board.leading')}
        </span>
      )}

      <div className={`${header} rounded-t-[14px] border-b-2 border-black px-4 pt-4 pb-3 flex items-center gap-3`}>
        <WalletAvatar address={a.wallet} size={64} className="!border-2 !border-black shrink-0" />
        <div className="min-w-0">
          <CopyableText value={a.wallet} display={truncateMiddle(a.wallet, 6, 4)} className="!text-base" />
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[11px] font-bold">
              {t('board.score')}: <span className="font-data">{score}</span>/{scoreMax}
            </span>
            {profile.data?.hackquestId && (
              <span className="rounded-full border-2 border-black bg-white px-2 py-0.5 text-[11px] font-bold font-data">
                {profile.data.hackquestId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {bio && <p className="text-sm text-gray-700 line-clamp-2 [overflow-wrap:anywhere]">{bio}</p>}

        <div className="relative">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-500">{t('board.votes')}</p>
          <div className="flex items-end justify-between gap-2">
            <p className="font-paytone text-5xl leading-none">{voters}</p>
            <p className="text-sm font-bold font-data text-gray-600">{voters > 0 ? `${share.toFixed(1)}%` : t('board.noneYet')}</p>
          </div>
          {bump > 0 && (
            <span className="pointer-events-none absolute -top-2 left-16 rounded-full border-2 border-black bg-skyellow px-3 py-1 text-sm font-extrabold shadow-[2px_2px_0_0_#000] animate-vote-pop">
              ⚡ +{bump}
            </span>
          )}
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full border-2 border-black bg-gray-200">
          <div className="h-full bg-skpurple transition-all duration-500" style={{ width: `${Math.min(100, share)}%` }} />
        </div>

        {weightText !== undefined && (
          <dl className="rounded-xl border-2 border-black bg-skyellow-light p-2.5 space-y-1 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-600">{t('board.weight')}</dt>
              <dd className="font-data font-bold text-right">{weightText}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-600">{t('board.backing')}</dt>
              <dd className="font-data font-bold text-right">
                {stakeInfo ? `${money(stakeInfo.amount)} · ${t('board.backers', { n: stakeInfo.backers })}` : '—'}
              </dd>
            </div>
            {myWeightText !== undefined && (
              <div className="flex justify-between gap-2 border-t-2 border-black/10 pt-1">
                <dt className="font-bold">{t('board.myVote')}</dt>
                <dd className="font-data font-bold text-right">{myWeightText}</dd>
              </div>
            )}
            {stakeInfo && stakeInfo.mine > 0n && (
              <div className="flex justify-between gap-2">
                <dt className="font-bold">{t('board.myBacking')}</dt>
                <dd className="font-data font-bold text-right">{money(stakeInfo.mine)}</dd>
              </div>
            )}
          </dl>
        )}

        <p className="text-xs text-gray-600">
          {t('board.recs')}:{' '}
          <span className="font-bold font-data">{recCount > 0 ? `${recCount} · ${recAvg}` : t('appl.recNone')}</span>
        </p>

        <div className="flex gap-2">
          {isMe ? (
            <div className="flex-1 rounded-xl border-2 border-black bg-gray-100 py-2.5 text-center text-sm font-extrabold uppercase tracking-wider text-gray-500">
              {t('board.you')}
            </div>
          ) : voted ? (
            <div className="flex-1 rounded-xl border-2 border-black bg-skgreen-dark py-2.5 text-center text-sm font-extrabold uppercase tracking-wider text-white shadow-[3px_3px_0_0_#000]">
              {t('board.voted')} ✓
            </div>
          ) : usedVote ? (
            // One vote per wallet per program: it is already spent on another candidate.
            <div title={t('board.oneVote')} className="flex-1 rounded-xl border-2 border-black bg-gray-100 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-gray-500">
              {t('board.oneVoteShort')}
            </div>
          ) : (
            <button
              type="button"
              onClick={onVote}
              className="flex-1 rounded-xl border-2 border-black bg-skpurple py-2.5 text-sm font-extrabold uppercase tracking-wider text-white shadow-[3px_3px_0_0_#000] transition-transform hover:bg-skpurple-hover active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              {t('board.vote')} ⚡
            </button>
          )}
          {onBack && !isMe && (
            // The contract allows a backing deposit only for the candidate you voted for, once per program.
            voted && !hasStaked ? (
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border-2 border-black bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider shadow-[3px_3px_0_0_#000] transition-transform hover:bg-skbw active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                {t('candidate.back')}
              </button>
            ) : (
              <div
                title={voted ? t('board.backDone') : t('board.backNeedVote')}
                className="rounded-xl border-2 border-black bg-gray-100 px-4 py-2.5 text-center text-xs font-extrabold uppercase tracking-wider text-gray-500"
              >
                {voted ? `${t('board.backedShort')} ✓` : t('candidate.back')}
              </div>
            )
          )}
        </div>
      </div>
    </article>
  );
}
