import type { ComponentProps, ReactNode } from 'react';
import { ConnectButton } from '@xellar/kit';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import toast from 'react-hot-toast';
import { DEFAULT_CHAIN_ID } from '@/lib/chain/chains';
import { useT } from '@/lib/i18n';
import { useWalletKitDown } from './walletKitStatus';

type Render = ComponentProps<typeof ConnectButton.Custom>['children'];

/**
 * Use this instead of `ConnectButton.Custom`: same render prop, and it keeps working when the wallet kit
 * is unavailable (the kit's own components throw without its provider).
 */
export function WalletButtonState({ children }: { children: Render }) {
  return useWalletKitDown() ? <ExtensionWallet>{children}</ExtensionWallet> : <ConnectButton.Custom>{children}</ConnectButton.Custom>;
}

/** The same actions with wagmi alone, for wallets installed in the browser. */
function ExtensionWallet({ children }: { children: Render }) {
  const { t } = useT();
  const { address, chain, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const connect = async () => {
    // Wallets that announce themselves come last in the list and are the most reliable.
    const injected = [...connectors].reverse().filter((c) => c.type === 'injected');
    for (const connector of injected) {
      if (!(await connector.getProvider().catch(() => undefined))) continue;
      try {
        await connectAsync({ connector });
      } catch {
        toast.error(t('walletKit.connectFailed'));
      }
      return;
    }
    toast.error(t('walletKit.noExtension'));
  };

  return children({
    isConnected,
    account: address ? { address } : undefined,
    chain,
    disconnect: () => disconnect(),
    openConnectModal: () => void connect(),
    openChainModal: () => switchChain({ chainId: DEFAULT_CHAIN_ID }),
    openProfileModal: () => {
      if (window.confirm(t('walletKit.confirmDisconnect'))) disconnect();
    },
  }) as ReactNode;
}
