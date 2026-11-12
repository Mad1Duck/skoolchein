import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useApproveUSDC, useDonate, needsApproval } from '@/lib/contracts/write-hooks';
import { useV4Addresses } from '@/lib/chain/useActiveChain';
import { getTokenMeta } from '@/lib/contracts/v4/token';
import { useTokenBalance } from '@/lib/contracts/v4/hooks/balance';
import { useTokenRate } from '@/context/token-rate-context';
import { formatToIDR, usdcToIdr } from '@/util/localCurrency';
import { TopUpModal } from '@/components/ramp/TopUpModal';
import { useT } from '@/lib/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: number;
  programName?: string;
  /** Program's payment token (`program.token`). Zero address = native currency.
   *  Defaults to native when omitted. */
  token?: `0x${string}`;
}

type Step = 'form' | 'approve' | 'donate' | 'done';

export function DonateModal({ isOpen, onClose, programId, programName, token }: Props) {
  const { t, tr } = useT();
  const v4Addresses = useV4Addresses();
  const { rate } = useTokenRate();
  // Declared before the state below, which seeds its default from it.
  const tokenMeta = getTokenMeta(token);
  // Native payments travel as msg.value — there's nothing to approve, and
  // calling approve() on the zero address would revert.
  const requiresApproval = needsApproval(token);

  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState(tokenMeta.minDonationHint);
  // Metadata link for the donor badge. Technical, so it lives under "Advanced".
  const [nftUri, setNftUri] = useState('ipfs://QmDonorNFT');

  const { hasEnough, shortfallIdr, refetch: refetchBalance } = useTokenBalance(token, amount);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const { approve, isPending: isApproving, isSuccess: approved } = useApproveUSDC();
  const { donate, isPending: isDonating, isSuccess: donated } = useDonate();

  // Step progression
  useEffect(() => {
    if (approved && step === 'approve') setStep('donate');
  }, [approved, step]);

  useEffect(() => {
    if (donated && step === 'donate') setStep('done');
  }, [donated, step]);

  const handleAction = () => {
    if (step === 'form') {
      if (requiresApproval) {
        setStep('approve');
        approve(v4Addresses.ScholarshipCore, amount);
      } else {
        // Skip straight to the transfer for native.
        setStep('donate');
      }
    } else if (step === 'donate') {
      donate(BigInt(programId), amount, nftUri, token);
    }
  };

  const handleClose = () => {
    setStep('form');
    setAmount(tokenMeta.minDonationHint);
    onClose();
  };

  // Rupiah equivalent, shown first when we know a USDC/IDR rate (USDC only).
  const amountIdr =
    !tokenMeta.isNative && rate && Number(amount) > 0 ? formatToIDR(usdcToIdr(Number(amount), rate)) : null;
  const amountText = amountIdr ?? `${amount} ${tokenMeta.symbol}`;

  if (step === 'done') {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('donate.successTitle')}>
        <div className="text-center py-10 space-y-4">
          <h2 className="font-paytone text-2xl">{t('donate.thanks')}</h2>
          <p className="text-gray-600">
            {t('donate.successBody', {
              amount: amountText,
              program: programName ?? `Program #${programId}`,
            })}
          </p>
          <NeoButton label={t('common.close')} variant="primary" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('donate.title')}>
      <div className="space-y-5">
        {step === 'form' && (
          <>
            <div className="bg-skgreen-light border-2 border-black p-4 text-sm shadow-[3px_3px_0_0_#000]">
              <p className="font-extrabold uppercase tracking-wider text-[10px] mb-2">{t('donate.howTitle')}</p>
              <ul className="text-gray-700 space-y-1 text-xs list-disc list-inside">
                <li>{tr('donate.how1')}</li>
                <li>{t('donate.how2')}</li>
                <li>{tr('donate.how3')}</li>
                <li>{t('donate.how4')}</li>
              </ul>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
                {t('donate.amountLabel', { symbol: tokenMeta.symbol })} <span className="text-skred">*</span>
              </label>
              <input
                type="number"
                min={tokenMeta.minDonationHint}
                step="any"
                className="w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amountIdr && (
                <p className="text-sm font-black mt-1">{t('donate.approx', { amount: amountIdr })}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {t('donate.minimum', { min: tokenMeta.minDonationHint, symbol: tokenMeta.symbol })}
              </p>
              {!hasEnough && (
                <p className="text-xs font-bold text-skred mt-2">
                  {shortfallIdr !== null
                    ? t('donate.shortfall', { amount: formatToIDR(shortfallIdr) })
                    : t('donate.shortfallToken', { symbol: tokenMeta.symbol })}
                </p>
              )}
              {!hasEnough && !tokenMeta.isNative && (
                <button
                  type="button"
                  className="text-xs font-bold underline mt-1"
                  onClick={() => setTopUpOpen(true)}
                >
                  {t('donate.addFunds')}
                </button>
              )}
            </div>

            <details className="text-xs">
              <summary className="cursor-pointer font-bold">{t('common.advanced')}</summary>
              <div className="mt-2">
                <label className="block text-xs font-extrabold uppercase tracking-widest mb-1.5">
                  {t('donate.badgeLabel')}
                </label>
                <input
                  type="text"
                  className="w-full font-data text-sm"
                  value={nftUri}
                  onChange={(e) => setNftUri(e.target.value)}
                  placeholder="ipfs://Qm..."
                />
                <p className="text-xs text-gray-500 mt-1">{t('donate.badgeHint')}</p>
              </div>
            </details>
          </>
        )}

        {step === 'approve' && (
          <div className="text-center py-10 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skyellow mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">{t('donate.preparing', { symbol: tokenMeta.symbol })}</p>
            <p className="text-sm text-gray-600">
              {tr('donate.preparingBody', { amount, symbol: tokenMeta.symbol })}
            </p>
          </div>
        )}

        {step === 'donate' && (
          <div className="text-center py-10 space-y-3">
            <div className="w-10 h-10 border-2 border-black bg-skgreen mx-auto animate-pulse mb-2" />
            <p className="font-bold text-lg">{t('donate.confirmTitle')}</p>
            <p className="text-sm text-gray-600">
              {tr('donate.confirmBody', { amount, symbol: tokenMeta.symbol })}
            </p>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton
            label={t('common.cancel')}
            variant="ghost"
            onClick={handleClose}
            disabled={isApproving || isDonating}
            fullWidth
          />
          {step === 'form' && (
            <NeoButton
              label={t('common.continue')}
              variant="success"
              onClick={handleAction}
              disabled={!amount || Number(amount) < Number(tokenMeta.minDonationHint) || !hasEnough}
              fullWidth
            />
          )}
          {step === 'donate' && (
            <NeoButton
              label={isDonating ? t('donate.donating') : t('donate.now')}
              variant="success"
              onClick={handleAction}
              loading={isDonating}
              disabled={isDonating}
              fullWidth
            />
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
