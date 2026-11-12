import { useChainId, useSwitchChain } from "wagmi";
import { DEFAULT_CHAIN_ID, SUPPORTED_CHAIN_IDS, getV4Addresses, isSupportedChain, type ChainAddresses } from "./chains";

/**
 * The chain the app is currently showing data for.
 *
 * `chainId` is the wallet's chain when we support it, otherwise DEFAULT_CHAIN_ID
 * (so pages still render read-only data). `isSupported` is false when the wallet
 * sits on a chain without a deployment — show a "switch network" prompt and
 * don't offer writes in that state.
 */
export function useActiveChain() {
  const walletChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const isSupported = isSupportedChain(walletChainId);
  const chainId = isSupported ? walletChainId : DEFAULT_CHAIN_ID;

  return {
    chainId,
    walletChainId,
    isSupported,
    supportedChainIds: SUPPORTED_CHAIN_IDS,
    switchTo: (id: number) => switchChain({ chainId: id }),
    isSwitching: isPending,
  };
}

/** Contract addresses for the active chain (render-time). */
export function useV4Addresses() {
  // Typed as fully present for ergonomics. A contract missing on a chain
  // (e.g. the price oracle) is `undefined` at runtime — use getV4Addresses()
  // directly where that matters (see useOracle).
  return getV4Addresses(useActiveChain().chainId) as Required<ChainAddresses>;
}
