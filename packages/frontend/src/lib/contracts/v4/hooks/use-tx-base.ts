import { useEffect, useRef } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getActiveChainId } from "@/lib/chain/chains";
import { requestRealtimeRefresh } from "@/lib/realtime/realtime";
import { beginTx, dismissTx, getTx, setTx } from "@/lib/tx/txStore";

/**
 * Shared helper for contract write transactions with loading and success states.
 *
 * confirmations: 1  — don't wait for extra confirmations (local dev chains)
 * pollingInterval   — poll every 1s so the receipt is caught quickly on local nodes
 *
 * Every write also drives the app-wide transaction card (see TxCard): signing -> confirming -> done.
 */
export function useTxHook() {
  const { data: hash, writeContract, isPending, error, reset } = useWriteContract();
  const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({
    hash,
    confirmations: 1,
    pollingInterval: 1_000,
  });
  // Only the hook instance that started a write may update the card.
  const mine = useRef(false);

  // Pin every write to the active chain: wagmi asks the wallet to switch if it is
  // on another one, instead of sending the tx to whatever chain the wallet is on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeOnActiveChain = ((variables: any, options?: any) => {
    const chainId = getActiveChainId();
    mine.current = true;
    beginTx({ ...variables, chainId });
    return writeContract({ chainId, ...variables }, options);
  }) as typeof writeContract;

  // The user's own transaction just landed: refresh live data now instead of
  // waiting for the indexer's event to come back over the realtime feed.
  useEffect(() => {
    if (isSuccess) requestRealtimeRefresh();
  }, [isSuccess]);

  // Mirror this hook's progress into the transaction card.
  useEffect(() => {
    if (!mine.current) return;
    if (error) setTx({ phase: "error", error });
    else if (isSuccess) setTx({ phase: "success", hash });
    else if (hash) setTx({ phase: "confirming", hash });
  }, [error, isSuccess, hash]);

  // reset() (a modal closing or retrying) clears the card too, unless a newer write owns it.
  const resetAll = () => {
    if (mine.current && getTx()?.phase !== "signing") dismissTx();
    mine.current = false;
    reset();
  };

  return {
    hash,
    writeContract: writeOnActiveChain,
    isPending: isPending || isWaiting,
    isSuccess,
    error,
    reset: resetAll,
  };
}
