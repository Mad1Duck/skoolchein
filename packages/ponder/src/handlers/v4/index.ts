import { scholarshipCoreHandlers } from "./core";
import { milestoneManagerHandlers } from "./milestones";
import { scholarshipBountyHandlers } from "./bounty";
import { committeeGovernanceHandlers } from "./governance";
import { scholarshipTreasuryHandlers, scholarshipReputationHandlers } from "./treasury";
import { scholarshipPriceOracleHandlers } from "./oracle";
import { scholarshipSelectionHandlers } from "./selection";

/**
 * Handlers must NOT catch their own errors. A thrown error stops the indexer (`ponder start` exits and
 * the container restarts and retries), so a failed write is noticed instead of leaving a permanent hole
 * in the data. Where an event can legitimately refer to a row that does not exist, check for the row.
 */
export const registerV4Handlers = () => {
  scholarshipCoreHandlers();
  milestoneManagerHandlers();
  scholarshipBountyHandlers();
  committeeGovernanceHandlers();
  scholarshipTreasuryHandlers();
  scholarshipReputationHandlers();

  // Always registered. When CONTRACT_PRICE_ORACLE is unset, ponder.config.ts
  // points this contract at the zero address, so these handlers simply never
  // fire — no need to branch here.
  scholarshipPriceOracleHandlers();

  // Same: optional address, so an unset CONTRACT_SELECTION just means these never fire.
  scholarshipSelectionHandlers();
};
