import { useEffect } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getActiveChainId } from "@/lib/chain/chains";
import { requestRealtimeRefresh } from "@/lib/realtime/realtime";

/**
 * Shared helper for contract write transactions with loading and success states.
 *
 * confirmations: 1  — don't wait for extra confirmations (local dev chains)
 * pollingInterval   — poll every 1s so the receipt is caught quickly on local nodes
 */
export function useTxHook() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
    pollingInterval: 1_000,
  });

  // Pin every write to the active chain: wagmi asks the wallet to switch if it is
  // on another one, instead of sending the tx to whatever chain the wallet is on.
  const writeOnActiveChain = ((variables: any, options?: any) =>
    writeContract({ chainId: getActiveChainId(), ...variables }, options)) as typeof writeContract;

  // The user's own transaction just landed: refresh live data now instead of
  // waiting for the indexer's event to come back over the realtime feed.
  useEffect(() => {
    if (isSuccess) requestRealtimeRefresh();
  }, [isSuccess]);

  return { 
    hash, 
    writeContract: writeOnActiveChain, 
    isPending: isPending || isWaiting, 
    isSuccess, 
    error, 
    reset 
  };
}
