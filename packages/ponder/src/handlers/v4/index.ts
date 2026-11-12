import { scholarshipCoreHandlers } from "./core";
import { milestoneManagerHandlers } from "./milestones";
import { scholarshipBountyHandlers } from "./bounty";
import { committeeGovernanceHandlers } from "./governance";
import { scholarshipTreasuryHandlers, scholarshipReputationHandlers } from "./treasury";
import { scholarshipPriceOracleHandlers } from "./oracle";
import { scholarshipSelectionHandlers } from "./selection";

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
