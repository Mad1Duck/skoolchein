import { useEffect, useState } from 'react';
import { useBonusPoolFlow } from '@/lib/contracts/v4/hooks/bonus-flow';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import { ErrorNotice } from '@/components/ErrorNotice';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useConfidenceStakeFlow } from '@/lib/contracts/v4';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useProgram } from '@/lib/api/hooks';
import { useReadContract } from 'wagmi';
import { scholarshipTreasuryAbi } from '@/constants/contractsV4';
import { getV4Addresses } from '@/lib/chain/chains';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { getTokenMeta, formatTokenAmount, formatTokenWithSymbol, parseTokenAmount } from '@/lib/contracts/v4/token';
import { formatToIDR } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';

/**
 * What a deposit of `amount` pays out in each outcome, so the donor can see it before signing.
 * Rates are the admin's (confidenceBonusPct / confidenceSlashPct). The bonus is paid from the
 * program's bonus pool, which the penalties of failed scholars and anyone's top-ups fill.
 */
function StakeOutcome({ amount, token, programId }: { amount: string; token?: `0x${string}`; programId: bigint }) {
  const { t } = useT();
  const { chainId } = useActiveChain();
  const { confidenceBonusPct, confidenceSlashPct } = useProtocolLimits();
  const BONUS_PCT = BigInt(confidenceBonusPct);
  const SLASH_PCT = BigInt(confidenceSlashPct);
  const { data: pool } = useReadContract({
    chainId,
    address: getV4Addresses(chainId).ScholarshipTreasury,
    abi: scholarshipTreasuryAbi,
    functionName: 'bonusPool',
    args: [programId],
  });

  let stake = 0n;
  try {
    stake = parseTokenAmount(amount, token);
  } catch {
    stake = 0n;
  }
  if (stake <= 0n) return null;

  const wanted = (stake * BONUS_PCT) / 100n;
  const available = pool === undefined ? undefined : (pool as bigint);
  // The bonus can never exceed what the program's yield pool holds.
  const bonus = available === undefined ? wanted : wanted < available ? wanted : available;
  const lost = (stake * SLASH_PCT) / 100n;
  const fmt = (v: bigint) => formatTokenWithSymbol(v, token);

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">{t('stake.calcTitle')}</p>

      <div className="rounded-xl border-2 border-black bg-skgreen p-3 text-sm space-y-1">
        <p className="font-extrabold">{t('stake.calcWin')}</p>
        <Row label={t('stake.calcDeposit')} value={fmt(stake)} />
        <Row label={t('stake.calcBonus', { pct: String(BONUS_PCT) })} value={`+ ${fmt(bonus)}`} />
        <Row label={t('stake.calcGet')} value={fmt(stake + bonus)} strong />
      </div>

      <div className="rounded-xl border-2 border-black bg-skred-light p-3 text-sm space-y-1">
        <p className="font-extrabold">{t('stake.calcLose')}</p>
        <Row label={t('stake.calcDeposit')} value={fmt(stake)} />
        <Row label={t('stake.calcSlash', { pct: String(SLASH_PCT) })} value={`− ${fmt(lost)}`} />
        <Row label={t('stake.calcGet')} value={fmt(stake - lost)} strong />
      </div>

      <p className="text-xs text-gray-500">
        {t('stake.poolNow', { pool: fmt(available ?? 0n) })}{' '}
        {available !== undefined && bonus < wanted ? t('stake.calcPoolShort') : t('stake.calcNote')}
      </p>
    </div>
  );
}

/** Anyone can add to the bonus pool; it can only leave as bonuses to supporters of a scholar who succeeds. */
function BonusPoolFunder({ programId, token }: { programId: bigint; token?: `0x${string}` }) {
  const { t } = useT();
  const tokenMeta = getTokenMeta(token);
  const [amount, setAmount] = useState('');
  const flow = useBonusPoolFlow(token);
  const { hasEnough } = useTokenBalance(token, amount || '0');

  useEffect(() => {
    if (flow.isSuccess) {
      setAmount('');
      flow.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.isSuccess]);

  return (
    <details className="rounded-xl border-2 border-black bg-white p-3 text-sm">
      <summary className="cursor-pointer font-bold">{t('stake.poolFund')}</summary>
      <p className="text-xs text-gray-600 mt-2">{t('stake.poolFundHint')}</p>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          min="0"
          step="1"
          placeholder={tokenMeta.symbol}
          className="min-w-0 flex-1 rounded-lg border-2 border-black p-2 font-data"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <NeoButton
          label={flow.isPending ? t('stake.poolFunding') : t('stake.poolFundBtn')}
          variant="secondary"
          className="!rounded-xl"
          loading={flow.isPending}
          disabled={flow.isPending || !amount || Number(amount) <= 0 || !hasEnough}
          onClick={() => flow.start(programId, amount)}
        />
      </div>
      {flow.error && <ErrorNotice error={flow.error} />}
    </details>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'border-t-2 border-black pt-1 font-extrabold' : ''}`}>
      <span>{label}</span>
      <span className="font-data">{value}</span>
    </div>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: bigint;
  scholarAddress: `0x${string}`;
  scholarName?: string;
  /** Program payment token (`program.token`). Zero address = native. */
  token?: `0x${string}`;
}

/**
 * Back a scholar with a refundable deposit. This is the single implementation;
 * features/v4/vote/components/ConfidenceStakeModal.tsx wraps it.
 *
 * The deposit is pulled from the wallet, so the flow approves first (ERC20
 * programs) and checks the wallet balance before starting.
 */
export function ConfidenceStakeModal({ isOpen, onClose, programId, scholarAddress, scholarName, token }: Props) {
  const { t } = useT();
  const tokenMeta = getTokenMeta(token);
  const [amount, setAmount] = useState('10');
  const [started, setStarted] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { start, phase, isPending, isSuccess, error, reset } = useConfidenceStakeFlow(token);
  const { balance, hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(token, amount);
  const { data: program } = useProgram(String(programId));

  // The deposit comes out of the wallet (not the voting weight). The contract only caps it at the
  // program's total fund, so that is the limit shown.
  const maxStake = Number(formatTokenAmount(program?.totalFund ?? '0', token));
  const name = scholarName ?? scholarAddress;

  const handleClose = () => {
    setStarted(false);
    reset();
    onClose();
  };

  const handleStart = () => {
    setStarted(true);
    start(programId, scholarAddress, amount);
  };

  if (isSuccess) {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('stake.successTitle')}>
        <div className="text-center py-8 space-y-3">
          <h2 className="text-2xl font-paytone">{t('stake.successHeading')}</h2>
          <p className="text-gray-600">
            {t('stake.successBody', { amount, symbol: tokenMeta.symbol, name })}
          </p>
          <NeoButton label={t('common.close')} onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  const amountNum = Number(amount);
  const overMax = amountNum > maxStake && maxStake > 0;
  const canSubmit = !!amount && amountNum > 0 && !overMax && hasEnough;
  const quick = [10, 50, 100].filter((v) => maxStake === 0 || v <= maxStake);

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('stake.title')}>
      <div className="space-y-4">
        {!started && (
          <>
            {/* Who you are backing */}
            <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-skyellow-light p-3">
              <WalletAvatar address={scholarAddress} size={40} />
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('vote.sumCandidate')}</p>
                <p className="font-paytone text-lg leading-tight truncate">{scholarName ?? shortenAddress(scholarAddress)}</p>
                <p className="font-data text-xs text-gray-600">{shortenAddress(scholarAddress)}</p>
              </div>
            </div>

            <p className="text-sm text-gray-700">{t('stake.intro')}</p>

            {/* Amount */}
            <div className="rounded-xl border-2 border-black bg-white p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="stake-amount" className="text-sm font-bold">
                  {t('stake.amountLabel', { symbol: tokenMeta.symbol })}
                </label>
                <span className="text-xs text-gray-600">
                  {t('stake.available')}: <span className="font-data font-bold">{formatTokenAmount(balance, token)} {tokenMeta.symbol}</span>
                </span>
              </div>
              <div className="relative">
                <input
                  id="stake-amount"
                  type="number"
                  min="1"
                  step="1"
                  className="w-full !rounded-xl !py-3 !pr-16 font-data text-2xl font-bold"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-data text-sm font-bold text-gray-500">
                  {tokenMeta.symbol}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {quick.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(String(v))}
                    className={`rounded-full border-2 border-black px-3 py-1 text-xs font-extrabold ${amount === String(v) ? 'bg-skyellow' : 'bg-white hover:bg-gray-50'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {overMax && (
                <p className="text-xs font-bold text-skred">
                  {t('stake.overMax', { max: `${maxStake.toLocaleString()} ${tokenMeta.symbol}` })}
                </p>
              )}
              {!hasEnough && (
                <p className="text-xs font-bold text-skred">
                  {t('stake.shortfall', {
                    amount: shortfallIdr !== null ? formatToIDR(shortfallIdr) : `${amount} ${tokenMeta.symbol}`,
                  })}{' '}
                  {!tokenMeta.isNative && (
                    <button type="button" className="underline" onClick={() => setTopUpOpen(true)}>
                      {t('donate.addFunds')}
                    </button>
                  )}
                </p>
              )}
              <p className="text-xs text-gray-500">{t('stake.limit', { max: `${maxStake.toLocaleString()} ${tokenMeta.symbol}` })}</p>
            </div>

            <StakeOutcome amount={amount} token={token} programId={programId} />
            <BonusPoolFunder programId={programId} token={token} />
          </>
        )}

        {started && (
          <div className="space-y-4 py-6 text-center">
            {/* Two steps for an ERC20 program: allow the funds, then deposit. */}
            {!tokenMeta.isNative && (
              <div className="flex items-center justify-center gap-2 text-xs font-bold">
                <span className={`rounded-full border-2 border-black px-3 py-1 ${phase === 'approving' ? 'bg-skyellow' : 'bg-skgreen'}`}>
                  1 · {t('stake.stepAllow')}
                </span>
                <span aria-hidden>→</span>
                <span className={`rounded-full border-2 border-black px-3 py-1 ${phase === 'approving' ? 'bg-white' : 'bg-skyellow'}`}>
                  2 · {t('stake.stepDeposit')}
                </span>
              </div>
            )}
            <p className="font-bold text-lg">
              {phase === 'approving' ? t('stake.approving', { symbol: tokenMeta.symbol }) : t('stake.confirming')}
            </p>
            <p className="text-sm text-gray-600">
              {phase === 'approving'
                ? t('stake.approvingBody', { amount, symbol: tokenMeta.symbol })
                : t('stake.confirmingBody')}
            </p>
            <p className="text-xs text-gray-500">{t('stake.scholar', { name })}</p>
            {error && <ErrorNotice error={error} />}
          </div>
        )}

        <div className="pt-3 border-t-2 border-gray-100 flex gap-2">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={handleClose} disabled={isPending} fullWidth />
          {!started && (
            <NeoButton label={t('stake.submit')} variant="primary" className="!rounded-xl" onClick={handleStart} disabled={!canSubmit} fullWidth />
          )}
          {started && error && (
            <NeoButton label={t('common.retry')} variant="primary" className="!rounded-xl" onClick={handleStart} fullWidth />
          )}
        </div>
      </div>
      <TopUpModal
        isOpen={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        suggestedIdr={shortfallIdr}
        onSuccess={() => refetchBalance()}
      />
    </NeoModal>
  );
}
