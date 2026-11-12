/**
 * Per-chain info for the "Isi saldo" flow, keyed by chain id.
 *
 * `exchangeLabel` is the network name a user must pick when withdrawing USDC
 * from an exchange — it is NOT always the wagmi chain name. `buyable: false`
 * marks test/private chains where no exchange can deliver real USDC.
 *
 * Add a row here when a new chain is added to `wagmiConfig`.
 */
export type RampNetwork = {
  exchangeLabel: string;
  buyable: boolean;
};

const RAMP_NETWORKS: Record<number, RampNetwork> = {
  8453: { exchangeLabel: 'Base', buyable: true },
  1135: { exchangeLabel: 'Lisk', buyable: true },
  84532: { exchangeLabel: 'Base Sepolia', buyable: false },
  4202: { exchangeLabel: 'Lisk Sepolia', buyable: false },
  1337: { exchangeLabel: 'Ganache', buyable: false },
  31338: { exchangeLabel: 'Nawasena', buyable: false },
};

export function getRampNetwork(chainId?: number, chainName?: string): RampNetwork {
  if (chainId !== undefined && RAMP_NETWORKS[chainId]) return RAMP_NETWORKS[chainId];
  // Unknown chain: show its own name, but never promise exchanges can deliver to it.
  return { exchangeLabel: chainName ?? 'jaringan Anda', buyable: false };
}
