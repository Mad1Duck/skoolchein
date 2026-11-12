import { useActiveChain } from "@/lib/chain/useActiveChain";
import { setActiveChainId } from "@/lib/chain/chains";

/**
 * Mirrors the active chain into module state so non-React code (contract-write
 * handlers, the axios interceptor) knows which chain to use. Renders nothing.
 * Assigned during render on purpose: it must be current before sibling
 * components below it read it in the same pass; the assignment is idempotent.
 */
export function ChainSync() {
  const { chainId } = useActiveChain();
  setActiveChainId(chainId);
  return null;
}
