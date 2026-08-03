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
 * Ponder v4 Configuration
 *
 * NOTE: Ponder validates every chain declared in `chains` at startup
 * (fetches latest block), even chains with no active contracts. Only
 * declare the chain actually in use to avoid startup failures.
 *
 * Currently: nawasena only (chain id 31338).
 */

const startBlock = Number(process.env.START_BLOCK ?? 0);
const chain = "nawasena" as const;

/**
 * Read a required contract address, failing loudly and by name.
 *
 * Ponder validates every configured address at startup; an unset var arrives
 * as "" and produces an opaque build error that doesn't say which one is
 * missing. This turns that into an actionable message.
 */
function requiredAddress(envKey: string): `0x${string}` {
  const value = process.env[envKey];
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(
      `${envKey} is missing or not a valid address (got: ${JSON.stringify(value)}). ` +
      `Set it in the root .env — run packages/contract/scripts/sync-deployments.ts <chainId> after deploying.`,
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
function optionalAddress(envKey: string): `0x${string}` {
  const value = process.env[envKey];
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    return "0x0000000000000000000000000000000000000000";
  }
  return value as `0x${string}`;
}

// The price oracle is deployed separately and may not exist yet. Indexing it
// is additive (token registry + USD rates), so a missing address must not
// stop the indexer from syncing everything else.
const priceOracleAddress = optionalAddress("CONTRACT_PRICE_ORACLE");

export default createConfig({
  chains: {
    nawasena: {
      id: 31338,
      rpc: process.env.PONDER_RPC_URL!,
    },
  },
  contracts: {
    ScholarshipCore: {
      chain,
      abi: scholarshipCoreAbi,
      address: requiredAddress("CONTRACT_CORE"),
      startBlock,
    },
    ScholarshipTreasury: {
      chain,
      abi: scholarshipTreasuryAbi,
      address: requiredAddress("CONTRACT_TREASURY"),
      startBlock,
    },
    ScholarshipBounty: {
      chain,
      abi: scholarshipBountyAbi,
      address: requiredAddress("CONTRACT_BOUNTY"),
      startBlock,
    },
    ScholarshipReputation: {
      chain,
      abi: scholarshipReputationAbi,
      address: requiredAddress("CONTRACT_REPUTATION"),
      startBlock,
    },
    CommitteeGovernance: {
      chain,
      abi: committeeGovernanceAbi,
      address: requiredAddress("CONTRACT_COMMITTEE"),
      startBlock,
    },
    MilestoneManager: {
      chain,
      abi: milestoneManagerAbi,
      address: requiredAddress("CONTRACT_MILESTONE_MANAGER"),
      startBlock,
    },
    // Token registry + admin USD rates. Indexed so the backend can serve the
    // token list and rates over REST without every client doing its own
    // contract reads.
    //
    // Address falls back to 0x0 when CONTRACT_PRICE_ORACLE is unset — an
    // empty string fails the whole indexer build, whereas the zero address
    // simply matches no logs. Optional add-ons must not take down
    // program/applicant/milestone indexing.
    ScholarshipPriceOracle: {
      chain,
      abi: scholarshipPriceOracleAbi,
      address: priceOracleAddress,
      startBlock,
    },
  },
});