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
 * CHAIN toggle via .env:
 *   CHAIN=localhost  → Hardhat node at 127.0.0.1:8545 (chain id 31337)
 *   CHAIN=nawasena   → Nawasena fork at PONDER_RPC_URL_NAWASENA (chain id 31338)
 *   CHAIN=lisk       → Lisk Sepolia via PONDER_RPC_URL_LISK  (default)
 */

const startBlock = Number(process.env.START_BLOCK ?? 0);
const chain =
  process.env.CHAIN === "nawasena"
    ? "nawasena"
    : process.env.CHAIN === "localhost"
      ? "localhost"
      : "lisk";

export default createConfig({
  chains: {
    lisk: {
      id: 4202,
      rpc: process.env.PONDER_RPC_URL_LISK!,
    },
    localhost: {
      id: 31337,
      rpc: "http://127.0.0.1:8545",
    },
    nawasena: {
      id: 31338,
      rpc: process.env.PONDER_RPC_URL_NAWASENA!,
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