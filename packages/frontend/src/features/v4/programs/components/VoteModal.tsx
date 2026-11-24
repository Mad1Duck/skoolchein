import { useState, useEffect } from 'react';
import { NeoModal } from '@/components/ui/NeoModal';
import { NeoButton } from '@/components/ui/NeoButton';
import { useVoteForCandidate } from '@/lib/contracts/v4';
import { useEffectiveVoteWeight } from '@/lib/contracts/v4/hooks/selection';
import { useReputation } from '@/lib/api/hooks';
import { useAccount } from 'wagmi';
import { useT } from '@/lib/i18n';
import { formatTokenWithSymbol } from '@/lib/contracts/v4/token';
import { WalletAvatar, shortenAddress } from '@/components/ui/WalletAvatar';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  programId: bigint;
  candidateAddress: `0x${string}`;
  candidateName?: string;
  /** Program payment token (`program.token`); voting weight is shown in it. Zero address = native. */
  token?: `0x${string}`;
}

/**
 * Confirm a vote: who you are backing, how (donation weight or reputation), what it is worth and what
 * it does to the final score. The transaction itself is shown by the app-wide transaction card.
 */
export function VoteModal({ isOpen, onClose, programId, candidateAddress, candidateName, token }: Props) {
  const { t } = useT();
  const { address } = useAccount();
  const [done, setDone] = useState(false);
  const [useReputationMode, setUseReputationMode] = useState(false);
  // Once the user picks a mode themselves we stop auto-selecting one.
  const [pickedMode, setPickedMode] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: repData, isLoading: loadingRep } = useReputation(address ?? '');
  const { weightBps } = useEffectiveVoteWeight(Number(programId));
  const { vote, isPending, isSuccess, reset } = useVoteForCandidate();

  const donationPower = repData?.remainingVotingPower ?? '0';
  const repBalance = repData?.repBalance ?? '0';
  const hasDonationPower = Number(donationPower) > 0;
  const hasReputation = Number(repBalance) > 0 && !repData?.isVotingLocked;
  const noVotingPower = !!repData && !hasDonationPower && !hasReputation;

  // Start on whichever mode the user can actually use: donation weight first,
  // reputation only when there is no donation weight left.
  useEffect(() => {
    if (pickedMode || !repData) return;
    setUseReputationMode(!hasDonationPower && hasReputation);
  }, [repData, pickedMode, hasDonationPower, hasReputation]);

  useEffect(() => {
    if (isSuccess && sent) setDone(true);
  }, [isSuccess, sent]);

  const handleVote = () => {
    setSent(true);
    vote(programId, candidateAddress, useReputationMode);
  };

  const handleClose = () => {
    setDone(false);
    setSent(false);
    setPickedMode(false);
    reset();
    onClose();
  };

  const name = candidateName ?? shortenAddress(candidateAddress);
  const modeLabel = useReputationMode ? t('vote.modeReputation') : t('vote.modeDonation');
  const weightText = useReputationMode ? repBalance : formatTokenWithSymbol(donationPower, token);
  const canVote = useReputationMode ? hasReputation : hasDonationPower;
  const impact = weightBps !== undefined ? weightBps / 100 : undefined;

  if (done) {
    return (
      <NeoModal isOpen={isOpen} onClose={handleClose} title={t('vote.successTitle')}>
        <div className="text-center py-8 space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full border-2 border-black bg-skgreen flex items-center justify-center text-2xl shadow-[3px_3px_0_0_#000]">✓</div>
          <h2 className="font-paytone text-2xl">{t('vote.successHeading')}</h2>
          <p className="text-gray-600 text-sm">{t('vote.successBody', { name, mode: modeLabel })}</p>
          <NeoButton label={t('common.close')} variant="primary" className="!rounded-xl" onClick={handleClose} fullWidth />
        </div>
      </NeoModal>
    );
  }

  return (
    <NeoModal isOpen={isOpen} onClose={handleClose} title={t('vote.title')}>
      <div className="space-y-4">
        {/* Who you are voting for */}
        <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-skyellow-light p-3">
          <WalletAvatar address={candidateAddress} size={40} />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('vote.sumCandidate')}</p>
            <p className="font-paytone text-lg leading-tight truncate">{name}</p>
            <p className="font-data text-xs text-gray-600">{shortenAddress(candidateAddress)}</p>
          </div>
        </div>

        {noVotingPower && (
          <div className="rounded-xl border-2 border-black bg-skyellow-light p-3 text-xs">{t('vote.noPower')}</div>
        )}

        {/* How */}
        <div className="space-y-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-500">{t('vote.sumMethod')}</p>
          <Option
            selected={!useReputationMode}
            disabled={isPending}
            onClick={() => { setPickedMode(true); setUseReputationMode(false); }}
            title={t('vote.optDonationTitle')}
            body={t('vote.optDonationBody')}
            value={formatTokenWithSymbol(donationPower, token)}
            selectedLabel={t('vote.selected')}
            unavailable={!loadingRep && !hasDonationPower ? t('vote.sumUnavailable') : undefined}
          />
          <Option
            selected={useReputationMode}
            disabled={isPending}
            onClick={() => { setPickedMode(true); setUseReputationMode(true); }}
            title={t('vote.optReputationTitle')}
            body={t('vote.optReputationBody')}
            value={repBalance}
            selectedLabel={t('vote.selected')}
            unavailable={!loadingRep && !hasReputation ? t('vote.sumUnavailable') : undefined}
          />
        </div>

        {useReputationMode && repData?.isVotingLocked && (
          <div className="rounded-xl border-2 border-black bg-skred-light p-3 text-xs text-skred">{t('vote.locked')}</div>
        )}

        {/* What it does */}
        <div className="rounded-xl border-2 border-black bg-white p-3 text-sm">
          <p className="font-bold mb-2">{t('vote.summary')}</p>
          <dl className="space-y-1.5">
            <Row label={t('vote.sumMethod')} value={modeLabel} />
            <Row label={t('vote.sumWeight')} value={weightText} />
            {impact !== undefined && <Row label={t('vote.sumImpact')} value={`${impact}%`} />}
          </dl>
          <p className="mt-2 text-xs text-gray-600">{t('vote.sumNote')}</p>
        </div>

        <div className="flex gap-2 pt-2 border-t-2 border-gray-100">
          <NeoButton label={t('common.cancel')} variant="ghost" className="!rounded-xl" onClick={handleClose} disabled={isPending} fullWidth />
          <NeoButton
            label={loadingRep ? t('vote.loading') : t('vote.confirm')}
            variant="primary"
            className="!rounded-xl"
            onClick={handleVote}
            loading={isPending}
            disabled={isPending || loadingRep || !canVote}
            fullWidth
          />
        </div>
      </div>
    </NeoModal>
  );
}

function Option({
  selected, disabled, onClick, title, body, value, selectedLabel, unavailable,
}: {
  selected: boolean; disabled: boolean; onClick: () => void; title: string; body: string; value: string; selectedLabel: string; unavailable?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left rounded-xl border-2 border-black p-3 flex items-start gap-3 transition-all duration-75 ${
        selected ? 'bg-skyellow-light shadow-[3px_3px_0_0_#000]' : 'bg-white hover:bg-gray-50'
      } ${unavailable ? 'opacity-70' : ''}`}
    >
      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 border-black flex items-center justify-center ${selected ? 'bg-skgreen' : 'bg-white'}`}>
        {selected && <span className="w-2 h-2 rounded-full bg-black" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="font-bold">{title}</span>
          {selected && <span className="text-[10px] font-extrabold uppercase">{selectedLabel}</span>}
        </span>
        <span className="block text-xs text-gray-600 mt-0.5">{body}</span>
        <span className="block font-data text-base font-bold mt-1">{value}</span>
        {unavailable && <span className="block text-xs font-bold text-skred mt-0.5">{unavailable}</span>}
      </span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-gray-600">{label}</dt>
      <dd className="font-data text-sm font-bold text-right [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}
