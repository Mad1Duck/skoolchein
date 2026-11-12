import { NeoSelect } from "@/components/ui/NeoSelect";
import { useActiveChain } from "@/lib/chain/useActiveChain";
import { chainLabel } from "@/lib/chain/chains";
import { useT } from "@/lib/i18n";

/** Network picker + a warning when the wallet is on a chain we have no deployment on. */
export function ChainSwitcher() {
  const { t } = useT();
  const { chainId, walletChainId, isSupported, supportedChainIds, switchTo, isSwitching } = useActiveChain();

  return (
    <div className="flex items-center gap-2">
      <NeoSelect
        size="sm"
        className="w-40"
        ariaLabel={t('chain.networkLabel')}
        value={chainId}
        disabled={isSwitching}
        onChange={switchTo}
        options={supportedChainIds.map((id) => ({ value: id, label: chainLabel(id) }))}
      />
      {!isSupported && (
        <span className="text-xs font-bold text-skred" title={`Wallet is on chain ${walletChainId}`}>
          {t('chain.unsupported')}
        </span>
      )}
    </div>
  );
}
