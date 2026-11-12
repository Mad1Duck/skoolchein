import { addr, getActiveChainId, usdcAddress } from "./chains";

export { addr };

/** USDC on the active chain (real USDC on public chains, MockUSDC on dev chains). */
export function usdcAddr(): `0x${string}` {
  const a = usdcAddress(getActiveChainId());
  if (!a) throw new Error(`No USDC configured for chain ${getActiveChainId()}`);
  return a;
}
