import { useEffect, useRef, useState } from "react";
import { addr } from "@/lib/chain/addr";
import { needsApproval, useApproveUSDC, useFundBonusPool } from "./treasury";

/**
 * Add to a program's bonus pool: approve the Treasury first (ERC20 programs only), then fund it.
 * Native programs just send the amount as value.
 */
export function useBonusPoolFlow(token?: `0x${string}`) {
  const approveTx = useApproveUSDC();
  const fundTx = useFundBonusPool();
  const [phase, setPhase] = useState<"idle" | "approving" | "funding">("idle");
  const pending = useRef<{ pid: bigint; amount: string } | null>(null);

  const start = (pid: bigint, amount: string) => {
    pending.current = { pid, amount };
    if (needsApproval(token)) {
      setPhase("approving");
      approveTx.approve(addr("ScholarshipTreasury"), amount);
    } else {
      setPhase("funding");
      fundTx.fund(pid, amount, token);
    }
  };

  useEffect(() => {
    if (phase === "approving" && approveTx.isSuccess && pending.current) {
      const { pid, amount } = pending.current;
      setPhase("funding");
      fundTx.fund(pid, amount, token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, approveTx.isSuccess]);

  const reset = () => {
    approveTx.reset();
    fundTx.reset();
    pending.current = null;
    setPhase("idle");
  };

  return {
    start,
    phase,
    isPending: approveTx.isPending || fundTx.isPending,
    isSuccess: fundTx.isSuccess,
    error: approveTx.error ?? fundTx.error,
    reset,
  };
}
