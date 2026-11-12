import { useEffect, useRef, useState } from "react";
import { addr } from "@/lib/chain/addr";
import { needsApproval } from "./treasury";
import { useApproveUSDC } from "./treasury";
import { usePlaceConfidenceStake } from "./core";

/**
 * Back a scholar: approve the deposit (ERC20 programs only), then place it.
 * placeConfidenceStake pulls the deposit from the wallet, so an ERC20 program
 * needs a prior approve(Core, amount); native programs send it as msg.value.
 */
export function useConfidenceStakeFlow(token?: `0x${string}`) {
  const approveTx = useApproveUSDC();
  const stakeTx = usePlaceConfidenceStake();
  const [phase, setPhase] = useState<"idle" | "approving" | "staking">("idle");
  const pending = useRef<{ pid: bigint; scholar: `0x${string}`; amount: string } | null>(null);

  const start = (pid: bigint, scholar: `0x${string}`, amount: string) => {
    pending.current = { pid, scholar, amount };
    if (needsApproval(token)) {
      setPhase("approving");
      approveTx.approve(addr("ScholarshipCore"), amount);
    } else {
      setPhase("staking");
      stakeTx.stake(pid, scholar, amount, token);
    }
  };

  useEffect(() => {
    if (phase === "approving" && approveTx.isSuccess && pending.current) {
      const { pid, scholar, amount } = pending.current;
      setPhase("staking");
      stakeTx.stake(pid, scholar, amount, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, approveTx.isSuccess]);

  const reset = () => {
    approveTx.reset();
    stakeTx.reset();
    pending.current = null;
    setPhase("idle");
  };

  return {
    start,
    phase,
    isPending: approveTx.isPending || stakeTx.isPending,
    isSuccess: stakeTx.isSuccess,
    error: approveTx.error ?? stakeTx.error,
    reset,
  };
}
