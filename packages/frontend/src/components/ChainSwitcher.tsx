import { useActiveChain } from "@/lib/chain/useActiveChain";
import { chainLabel } from "@/lib/chain/chains";
import { useT } from "@/lib/i18n";

/** Network picker + a warning when the wallet is on a chain we have no deployment on. */
export function ChainSwitcher() {
  const { t } = useT();
  const { chainId, walletChainId, isSupported, supportedChainIds, switchTo, isSwitching } = useActiveChain();

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={t('chain.networkLabel')}
        className="border-2 border-black rounded-lg px-2 py-1 text-sm font-bold bg-white"
        value={chainId}
        disabled={isSwitching}
        onChange={(e) => switchTo(Number(e.target.value))}
      >
        {supportedChainIds.map((id) => (
          <option key={id} value={id}>{chainLabel(id)}</option>
        ))}
      </select>
      {!isSupported && (
        <span className="text-xs font-bold text-skred" title={`Wallet is on chain ${walletChainId}`}>
          {t('chain.unsupported')}
        </span>
      )}
    </div>
  );
}
