import { createConfig } from "ponder";
import dotenv from "dotenv";
import { scholarshipCoreAbi } from "./abis/v4/ScholarshipCore";
import { scholarshipTreasuryAbi } from "./abis/v4/ScholarshipTreasury";
import { scholarshipBountyAbi } from "./abis/v4/ScholarshipBounty";
import { scholarshipReputationAbi } from "./abis/v4/ScholarshipReputation";
import { committeeGovernanceAbi } from "./abis/v4/CommitteeGovernance";
import { milestoneManagerAbi } from "./abis/v4/MilestoneManager";

dotenv.config();

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
      address: process.env.CONTRACT_CORE! as `0x${string}`,
      startBlock,
    },
    ScholarshipTreasury: {
      chain,
      abi: scholarshipTreasuryAbi,
      address: process.env.CONTRACT_TREASURY! as `0x${string}`,
      startBlock,
    },
    ScholarshipBounty: {
      chain,
      abi: scholarshipBountyAbi,
      address: process.env.CONTRACT_BOUNTY! as `0x${string}`,
      startBlock,
    },
    ScholarshipReputation: {
      chain,
      abi: scholarshipReputationAbi,
      address: process.env.CONTRACT_REPUTATION! as `0x${string}`,
      startBlock,
    },
    CommitteeGovernance: {
      chain,
      abi: committeeGovernanceAbi,
      address: process.env.CONTRACT_COMMITTEE! as `0x${string}`,
      startBlock,
    },
    MilestoneManager: {
      chain,
      abi: milestoneManagerAbi,
      address: process.env.CONTRACT_MILESTONE_MANAGER! as `0x${string}`,
      startBlock,
    },
  },
});