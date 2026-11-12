import { createConfig } from "ponder";
import dotenv from "dotenv";
import { scholarshipCoreAbi } from "./abis/v4/ScholarshipCore";
import { scholarshipTreasuryAbi } from "./abis/v4/ScholarshipTreasury";
import { scholarshipBountyAbi } from "./abis/v4/ScholarshipBounty";
import { scholarshipReputationAbi } from "./abis/v4/ScholarshipReputation";
import { committeeGovernanceAbi } from "./abis/v4/CommitteeGovernance";
import { milestoneManagerAbi } from "./abis/v4/MilestoneManager";
import { scholarshipPriceOracleAbi } from "./abis/v4/ScholarshipPriceOracle";

dotenv.config();

// Ponder's own CLI reads process.env.DATABASE_URL directly for its Postgres
// connection — it has no concept of DATABASE_INDEXER_URL. When the indexer
// is meant to use a genuinely separate database from packages/backend's
// (see root .env.example section 3), this redirects it before Ponder's
// bootstrap connects. Works identically in Docker and bare `bun dev`/`start`
// (docker-compose.yml does the same redirect at the compose level, but that
// only applies when actually running through Compose).
if (process.env.DATABASE_INDEXER_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_INDEXER_URL;
}

/**
 * Ponder v4 Configuration — multichain.
 *
 * NOTE: Ponder validates every chain declared in `chains` at startup
 * (fetches latest block), even chains with no active contracts. Only declare
 * chains you actually index.
 *
 * Which chains are indexed is driven by PONDER_CHAIN_IDS (comma-separated chain
 * ids, default "31338" = nawasena only). For each chain id <ID> the env supplies:
 *
 *   PONDER_RPC_URL_<ID>      RPC endpoint
 *   START_BLOCK_<ID>         first block to index (default 0)
 *   CONTRACT_CORE_<ID>, CONTRACT_TREASURY_<ID>, CONTRACT_BOUNTY_<ID>,
 *   CONTRACT_REPUTATION_<ID>, CONTRACT_COMMITTEE_<ID>,
 *   CONTRACT_MILESTONE_MANAGER_<ID>, CONTRACT_PRICE_ORACLE_<ID> (optional)
 *
 * For nawasena (31338) the legacy unsuffixed names (PONDER_RPC_URL, START_BLOCK,
 * CONTRACT_CORE, ...) are still honoured, so existing .env files keep working.
 * Supported chains and their names live in CHAINS below.
 */

const CHAINS = {
  31338: "nawasena",
  8453: "base",
  1135: "lisk",
} as const;

type ChainId = keyof typeof CHAINS;
const LEGACY_CHAIN_ID = 31338;

const chainIds: number[] = (process.env.PONDER_CHAIN_IDS ?? String(LEGACY_CHAIN_ID))
  .split(",")
  .map((v) => Number(v.trim()))
  .filter(Boolean);

for (const id of chainIds) {
  if (!(id in CHAINS)) {
    throw new Error(
      `PONDER_CHAIN_IDS contains ${id}, which is not in CHAINS (${Object.keys(CHAINS).join(", ")}). ` +
      `Add it to CHAINS in ponder.config.ts first.`,
    );
  }
}

/** Read <KEY>_<chainId>, falling back to the unsuffixed <KEY> for the legacy chain. */
function chainEnv(key: string, chainId: number): string | undefined {
  const scoped = process.env[`${key}_${chainId}`];
  if (scoped) return scoped;
  return chainId === LEGACY_CHAIN_ID ? process.env[key] : undefined;
}

/**
 * Read a required contract address, failing loudly and by name.
 *
 * Ponder validates every configured address at startup; an unset var arrives
 * as "" and produces an opaque build error that doesn't say which one is
 * missing. This turns that into an actionable message.
 */
function requiredAddress(envKey: string, chainId: number): `0x${string}` {
  const value = chainEnv(envKey, chainId);
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(
      `${envKey}_${chainId} is missing or not a valid address (got: ${JSON.stringify(value)}). ` +
      `Set it in the root .env — run packages/contract/scripts/sync-deployments.ts ${chainId} after deploying.`,
    );
  }
  return value as `0x${string}`;
}

/**
 * Optional contract address, falling back to the zero address when unset.
 *
 * The contract stays declared either way — dropping the key would make it
 * optional in the config type, which strips its events from Ponder's
 * `EventNames` and breaks the handlers that reference them. The zero address
 * is a valid address that never emits logs, so an undeployed contract simply
 * indexes nothing instead of failing the build (an empty string would).
 */
function optionalAddress(envKey: string, chainId: number): `0x${string}` {
  const value = chainEnv(envKey, chainId);
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return "0x0000000000000000000000000000000000000000";
  }
  return value as `0x${string}`;
}

/** Per-chain `{ address, startBlock }` map for one contract, keyed by chain name. */
function perChain(envKey: string, optional = false) {
  const out: Record<string, { address: `0x${string}`; startBlock: number }> = {};
  for (const id of chainIds as ChainId[]) {
    out[CHAINS[id]] = {
      address: optional ? optionalAddress(envKey, id) : requiredAddress(envKey, id),
      startBlock: Number(chainEnv("START_BLOCK", id) ?? 0),
    };
  }
  return out;
}

const chains = Object.fromEntries(
  (chainIds as ChainId[]).map((id) => {
    const rpc = chainEnv("PONDER_RPC_URL", id);
    if (!rpc) throw new Error(`PONDER_RPC_URL_${id} is not set`);
    return [CHAINS[id], { id, rpc }];
  }),
);

// The price oracle is deployed separately and may not exist yet. Indexing it
// is additive (token registry + USD rates), so a missing address must not
// stop the indexer from syncing everything else.
export default createConfig({
  chains,
  contracts: {
    ScholarshipCore: { abi: scholarshipCoreAbi, chain: perChain("CONTRACT_CORE") },
    ScholarshipTreasury: { abi: scholarshipTreasuryAbi, chain: perChain("CONTRACT_TREASURY") },
    ScholarshipBounty: { abi: scholarshipBountyAbi, chain: perChain("CONTRACT_BOUNTY") },
    ScholarshipReputation: { abi: scholarshipReputationAbi, chain: perChain("CONTRACT_REPUTATION") },
    CommitteeGovernance: { abi: committeeGovernanceAbi, chain: perChain("CONTRACT_COMMITTEE") },
    MilestoneManager: { abi: milestoneManagerAbi, chain: perChain("CONTRACT_MILESTONE_MANAGER") },
    // Token registry + admin USD rates. Indexed so the backend can serve the
    // token list and rates over REST without every client doing its own
    // contract reads. Optional per chain — see optionalAddress.
    ScholarshipPriceOracle: { abi: scholarshipPriceOracleAbi, chain: perChain("CONTRACT_PRICE_ORACLE", true) },
  },
});
