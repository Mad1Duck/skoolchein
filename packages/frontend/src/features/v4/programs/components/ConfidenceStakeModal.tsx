import { useEffect, useState } from 'react';
import { useBonusPoolFlow } from '@/lib/contracts/v4/hooks/bonus-flow';
import { useProtocolLimits } from '@/lib/contracts/v4/hooks/config';
import { ErrorNotice } from '@/components/ErrorNotice';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useConfidenceStakeFlow } from '@/lib/contracts/v4';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';
import { useReadContract } from 'wagmi';
import { scholarshipTreasuryAbi } from '@/constants/contractsV4';
import { getV4Addresses } from '@/lib/chain/chains';
import { useActiveChain } from '@/lib/chain/useActiveChain';
import { getTokenMeta, formatTokenAmount, formatTokenWithSymbol, parseTokenAmount } from '@/lib/contracts/v4/token';
import { formatToIDR } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';

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
  const { address } = useAccount();
  const [amount, setAmount] = useState('10');
  const [started, setStarted] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { data: repData } = useReputation(address ?? '');
  const { start, phase, isPending, isSuccess, error, reset } = useConfidenceStakeFlow(token);
  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(token, amount);

  const donationPower = repData?.remainingVotingPower ?? '0';
  const maxStake = Number(formatTokenAmount(donationPower, token));
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

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('stake.title')}>
      <div className="space-y-4">
        {!started && (
          <>
            <p className="text-sm text-gray-700 bg-skyellow-light p-3 border-2 border-black rounded-lg">
              {t('stake.intro')}
            </p>

            <div className="bg-white border-2 border-dashed border-black p-3 flex justify-between items-center shadow-[2px_2px_0_0_#000]">
              <span className="text-xs font-bold text-gray-500 uppercase">{t('stake.available')}</span>
              <span className="font-black">{formatTokenAmount(donationPower, token)} {tokenMeta.symbol}</span>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">
                {t('stake.amountLabel', { symbol: tokenMeta.symbol })}
              </label>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full border-2 border-black p-4 font-black text-xl shadow-[3px_3px_0_0_#000]"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-2">{t('stake.limit')}</p>
              {!hasEnough && (
                <p className="text-xs font-bold text-skred mt-2">
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
            </div>

            <StakeOutcome amount={amount} token={token} programId={programId} />
            <BonusPoolFunder programId={programId} token={token} />
          </>
        )}

        {started && (
          <div className="text-center py-10 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skpurple mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">
              {phase === 'approving'
                ? t('stake.approving', { symbol: tokenMeta.symbol })
                : t('stake.confirming')}
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

        <div className="pt-4 border-t-2 border-gray-100 flex justify-end gap-2">
          <NeoButton label={t('common.cancel')} variant="ghost" onClick={handleClose} disabled={isPending} />
          {!started && (
            <NeoButton
              label={t('stake.submit')}
              variant="primary"
              onClick={handleStart}
              disabled={!amount || Number(amount) <= 0 || Number(amount) > maxStake || !hasEnough}
            />
          )}
          {started && error && (
            <NeoButton label={t('common.retry')} variant="primary" onClick={handleStart} />
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
