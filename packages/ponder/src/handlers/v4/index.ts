import { scholarshipCoreHandlers } from "./core";
import { milestoneManagerHandlers } from "./milestones";
import { scholarshipBountyHandlers } from "./bounty";
import { committeeGovernanceHandlers } from "./governance";
import { scholarshipTreasuryHandlers, scholarshipReputationHandlers } from "./treasury";
import { scholarshipPriceOracleHandlers } from "./oracle";

export const registerV4Handlers = () => {
  scholarshipCoreHandlers();
  milestoneManagerHandlers();
  scholarshipBountyHandlers();
  committeeGovernanceHandlers();
  scholarshipTreasuryHandlers();
  scholarshipReputationHandlers();
  scholarshipPriceOracleHandlers();
};
