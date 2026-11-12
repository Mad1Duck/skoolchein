import { useState } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useConfidenceStakeFlow } from '@/lib/contracts/v4';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';
import { getTokenMeta, formatTokenAmount } from '@/lib/contracts/v4/token';
import { formatToIDR } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';
import { friendlyErrorKey } from '@/lib/errors';

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
            {error && (
              <div className="bg-skred-light p-3 text-xs text-skred border-2 border-black shadow-[2px_2px_0_0_#000]">
                {t(friendlyErrorKey(error))}
              </div>
            )}
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
