import { useSyncExternalStore } from "react";
import { estimateContractGas, getGasPrice } from "viem/actions";
import { formatEther } from "viem";
import { getAccount, getPublicClient } from "wagmi/actions";
import { wagmiConfig } from "@/constants/wagmi.config";

/**
 * One transaction card for the whole app. Every contract write goes through useTxHook, which reports
 * its progress here; <TxCard/> (mounted once) shows it. Modals no longer need their own spinner.
 */
export type TxPhase = "signing" | "confirming" | "success" | "error";

export interface TxState {
  phase: TxPhase;
  /** Contract function name, e.g. "donate". */
  fn: string;
  /** Optional headline amount, e.g. "500 USDC". Set with describeNextTx() before the write. */
  amount?: string;
  /** Estimated network fee, e.g. "≈ 0.00002 ETH". Undefined while unknown. */
  fee?: string;
  hash?: `0x${string}`;
  error?: unknown;
}

let state: TxState | null = null;
let pendingAmount: string | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getTx = () => state;
export const subscribeTx = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useTx = () => useSyncExternalStore(subscribeTx, getTx, getTx);

/** Call right before a write to show an amount on the card (donations, stakes…). Used once. */
export function describeNextTx(amount: string) {
  pendingAmount = amount;
}

export function setTx(patch: Partial<TxState> & { phase: TxPhase }) {
  state = { fn: "", ...(state ?? {}), ...patch } as TxState;
  emit();
}

export function dismissTx() {
  state = null;
  emit();
}

/** Starts a card for a new write and estimates its network fee in the background. */
export function beginTx(variables: { address: `0x${string}`; abi: never; functionName: string; args?: unknown[]; value?: bigint; chainId?: number }) {
  const amount = pendingAmount;
  pendingAmount = undefined;
  state = { phase: "signing", fn: variables.functionName, amount };
  emit();

  const mine = state;
  void (async () => {
    try {
      const client = getPublicClient(wagmiConfig, { chainId: variables.chainId as never });
      const account = getAccount(wagmiConfig).address;
      if (!client || !account) return;
      const [gas, price] = await Promise.all([
        estimateContractGas(client, {
          address: variables.address,
          abi: variables.abi,
          functionName: variables.functionName as never,
          args: variables.args as never,
          value: variables.value,
          account,
        } as never),
        getGasPrice(client),
      ]);
      if (!state || state.fn !== mine.fn) return; // gone, or replaced by a newer transaction
      const symbol = client.chain?.nativeCurrency?.symbol ?? "ETH";
      const native = Number(formatEther(gas * price));
      const text = native === 0 ? `≈ 0 ${symbol}` : native < 0.000001 ? `< 0.000001 ${symbol}` : `≈ ${native.toPrecision(2)} ${symbol}`;
      if (state) {
        state = { ...state, fee: text };
        emit();
      }
    } catch {
      /* the estimate is a courtesy; the wallet shows the real fee */
    }
  })();
}
