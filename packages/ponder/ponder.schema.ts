/**
 * ponder.schema.ts
 *
 * Ponder-owned onchain tables. Ponder's own build-id/crash-recovery engine
 * manages migrations for everything defined here (schema `skoolcein`) —
 * no drizzle-kit involved. Do NOT add tables here that aren't written by
 * a chain event handler (see `v4_external_learning`, which lives in
 * packages/backend's own Drizzle schema instead).
 *
 * Primary keys use natural on-chain identifiers instead of random UUIDs
 * (Ponder's onchainTable doesn't auto-generate server-side UUIDs, and the
 * previous Drizzle schema was reusing a program's UUID as the PK for
 * unrelated applicant/vote/stake rows on first-insert, which collided for
 * every row after the first per program).
 */

import { onchainTable, onchainEnum, primaryKey } from "ponder";
import { relations } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ══════════════════════════════════════════════════════════════════════════════

export const programStatusEnum = onchainEnum("program_status", ["CREATED", "APPLICATION_OPEN", "SCREENING", "VOTING", "ACTIVE", "COMPLETED", "CANCELLED"]);
export const disputeTypeEnum = onchainEnum("dispute_type", ["LIGHT_FRAUD", "MILESTONE_FRAUD", "HEAVY_FRAUD"]);
export const disputeStatusEnum = onchainEnum("dispute_status", ["ACTIVE", "STUDENT_CONCEDED", "AUTO_GUILTY", "BH_WON", "BH_LOST"]);
export const studentStatusEnum = onchainEnum("student_status", ["ACTIVE", "COMPLETED", "FROZEN", "BLACKLISTED"]);
export const milestoneStatusEnum = onchainEnum("milestone_status", ["PENDING", "PROPOSED", "SUBMITTED", "DISPUTED", "COMPLETED", "FROZEN", "REJECTED"]);
export const applicationStatusEnum = onchainEnum("application_status", ["PENDING_REVIEW", "SHORTLISTED", "SCREENED_OUT", "LOCKED"]);

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM TABLES
// ══════════════════════════════════════════════════════════════════════════════

/** Tracks the last indexed block per event for reorg safety and resume. */
export const indexedBlocks = onchainTable("indexed_blocks", (t) => ({
  blockNumber: t.integer("block_number").primaryKey(),
  eventName: t.text("event_name").default(""),
  timestamp: t.timestamp("timestamp", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Programs
// ══════════════════════════════════════════════════════════════════════════════

/** Full v4 program record — created on ProgramCreated, updated on ProgramStatusChanged */
export const v4Programs = onchainTable("v4_programs", (t) => ({
  pid: t.integer("pid").primaryKey(),
  initiator: t.text("initiator").notNull(),
  metadataCID: t.text("metadata_cid").default(""),
  status: programStatusEnum("status").default("CREATED"),
  educationLevel: t.integer("education_level").default(0),
  screeningMode: t.integer("screening_mode").default(0),
  maxCandidates: t.integer("max_candidates").default(0),
  targetWinners: t.integer("target_winners").default(0),
  committeeContract: t.text("committee_contract").default(""),
  totalFund: t.numeric("total_fund").default("0"),
  allocatedFund: t.numeric("allocated_fund").default("0"),
  spentFund: t.numeric("spent_fund").default("0"),
  yieldAccrued: t.numeric("yield_accrued").default("0"),
  protocolFeeCollected: t.numeric("protocol_fee_collected").default("0"),
  applicantCount: t.integer("applicant_count").default(0),
  shortlistedCount: t.integer("shortlisted_count").default(0),
  activeScholarCount: t.integer("active_scholar_count").default(0),
  applicationStart: t.timestamp("application_start", { withTimezone: true }),
  applicationEnd: t.timestamp("application_end", { withTimezone: true }),
  votingStart: t.timestamp("voting_start", { withTimezone: true }),
  votingEnd: t.timestamp("voting_end", { withTimezone: true }),
  openDonation: t.boolean("open_donation").default(true),
  resolveProgress: t.integer("resolve_progress").default(0),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Applicants & Scholars
// ══════════════════════════════════════════════════════════════════════════════

/** Applicant row — PK (pid, wallet). Updated on ScoreSubmitted, StudentShortlisted, StudentScreenedOut */
export const v4Applicants = onchainTable("v4_applicants", (t) => ({
  pid: t.integer("pid").notNull(),
  wallet: t.text("wallet").notNull(),
  status: applicationStatusEnum("status").default("PENDING_REVIEW"),
  profileCID: t.text("profile_cid").default(""),
  documentCID: t.text("document_cid").default(""),
  essayCID: t.text("essay_cid").default(""),
  screeningScore: t.numeric("screening_score").default("0"),
  totalScore: t.numeric("total_score").default("0"),
  retryCount: t.integer("retry_count").default(0),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.pid, table.wallet] }),
}));

/** Active scholar — PK (pid, wallet). Created on ScholarSelected, updated on milestones + fraud */
export const v4Scholars = onchainTable("v4_scholars", (t) => ({
  pid: t.integer("pid").notNull(),
  wallet: t.text("wallet").notNull(),
  status: studentStatusEnum("status").default("ACTIVE"),
  freezeUntil: t.timestamp("freeze_until", { withTimezone: true }),
  isBlacklisted: t.boolean("is_blacklisted").default(false),
  currentMilestone: t.integer("current_milestone").default(0),
  totalMilestones: t.integer("total_milestones").default(0),
  totalReceived: t.numeric("total_received").default("0"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.pid, table.wallet] }),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Milestones
// ══════════════════════════════════════════════════════════════════════════════

/** Milestone row — PK blockchainId (globally unique on-chain milestone id) */
export const v4Milestones = onchainTable("v4_milestones", (t) => ({
  blockchainId: t.integer("blockchain_id").primaryKey(),
  pid: t.integer("pid"),
  scholarWallet: t.text("scholar_wallet"),
  kind: t.text("kind").default("MANDATORY"), // MANDATORY | OPTIONAL | NEGOTIATED
  requiresProof: t.boolean("requires_proof").default(false),
  amount: t.numeric("amount").default("0"),
  proofCID: t.text("proof_cid").default(""),
  status: milestoneStatusEnum("status").default("PENDING"),
  proposedBy: t.text("proposed_by"),  // wallet that proposed (OPTIONAL/NEGOTIATED)
  approvedBy: t.text("approved_by"),  // wallet that approved/rejected
  submittedAt: t.timestamp("submitted_at", { withTimezone: true }),
  disputeDeadline: t.timestamp("dispute_deadline", { withTimezone: true }),
  completedAt: t.timestamp("completed_at", { withTimezone: true }),
  provider: t.text("provider"),
  externalId: t.text("external_id"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Voting & Confidence Stakes
// ══════════════════════════════════════════════════════════════════════════════

/** Donor vote — PK (pid, voterAddress). Created on VoteCast */
export const v4Votes = onchainTable("v4_votes", (t) => ({
  pid: t.integer("pid").notNull(),
  voterAddress: t.text("voter_address").notNull(),
  candidateAddress: t.text("candidate_address").notNull(),
  votingWeight: t.numeric("voting_weight").default("0"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.pid, table.voterAddress] }),
}));

/** Optional confidence stake — PK (pid, voterAddress). Created on ConfidenceStaked, resolved on ConfidenceStakeResolved */
export const v4ConfidenceStakes = onchainTable("v4_confidence_stakes", (t) => ({
  pid: t.integer("pid").notNull(),
  voterAddress: t.text("voter_address").notNull(),
  scholarAddress: t.text("scholar_address").notNull(),
  amount: t.numeric("amount").default("0"),
  isResolved: t.boolean("is_resolved").default(false),
  wasSlashed: t.boolean("was_slashed").default(false),
  returnedAmount: t.numeric("returned_amount").default("0"),
  bonusAmount: t.numeric("bonus_amount").default("0"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.pid, table.voterAddress] }),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Disputes
// ══════════════════════════════════════════════════════════════════════════════

/** Bounty hunter dispute — PK blockchainId. Created on DisputeRaised, updated through resolution */
export const v4Disputes = onchainTable("v4_disputes", (t) => ({
  blockchainId: t.integer("blockchain_id").primaryKey(),
  pid: t.integer("pid"),
  milestoneId: t.integer("milestone_id"),       // 0 = program-level dispute
  scholarAddress: t.text("scholar_address").notNull(),
  bountyHunter: t.text("bounty_hunter").notNull(),
  disputeType: disputeTypeEnum("dispute_type").notNull(),
  status: disputeStatusEnum("status").default("ACTIVE"),
  evidenceCID: t.text("evidence_cid").default(""),
  counterEvidenceCID: t.text("counter_evidence_cid").default(""),
  stake: t.numeric("stake").default("0"),
  potentialReward: t.numeric("potential_reward").default("0"),
  bhRewardPaid: t.numeric("bh_reward_paid").default("0"),
  raisedAt: t.timestamp("raised_at", { withTimezone: true }),
  defenseDeadline: t.timestamp("defense_deadline", { withTimezone: true }),
  resolvedAt: t.timestamp("resolved_at", { withTimezone: true }),
  isLateDispute: t.boolean("is_late_dispute").default(false),
  griefingStakeOriginal: t.numeric("griefing_stake_original").default("0"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Reputation (Soulbound Token)
// ══════════════════════════════════════════════════════════════════════════════

/** REP balance per address — PK address. Upserted on ReputationMinted / ReputationBurned */
export const v4Reputation = onchainTable("v4_reputation", (t) => ({
  address: t.text("address").primaryKey(),
  repBalance: t.numeric("rep_balance").default("0"),
  totalMinted: t.numeric("total_minted").default("0"),
  totalBurned: t.numeric("total_burned").default("0"),
  remainingVotingPower: t.numeric("remaining_voting_power").default("0"),
  votingLockedUntil: t.timestamp("voting_locked_until", { withTimezone: true }),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

/** Tracks manual withdrawals of slashed funds from Treasury — PK transactionHash */
export const v4TreasuryWithdrawals = onchainTable("v4_treasury_withdrawals", (t) => ({
  transactionHash: t.text("tx_hash").primaryKey(),
  recipient: t.text("recipient").notNull(),
  amount: t.numeric("amount").default("0"),
  timestamp: t.timestamp("timestamp", { withTimezone: true }).$defaultFn(() => new Date()),
}));

/** Tracks Fraud NFTs (Tainted credentials) issued to blacklisted students — PK transactionHash */
export const v4FraudNfts = onchainTable("v4_fraud_nfts", (t) => ({
  transactionHash: t.text("tx_hash").primaryKey(),
  scholarWallet: t.text("scholar_wallet").notNull(),
  pid: t.integer("pid").notNull(),
  tokenId: t.integer("token_id"),
  metadataUri: t.text("metadata_uri").default(""),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Donations
// ══════════════════════════════════════════════════════════════════════════════

/** Individual donation record — PK transactionHash. Created on Treasury:DonationRecorded */
export const v4Donations = onchainTable("v4_donations", (t) => ({
  transactionHash: t.text("tx_hash").primaryKey(),
  pid: t.integer("pid").notNull(),
  donor: t.text("donor").notNull(),
  grossAmount: t.numeric("gross_amount").default("0"),
  netAmount: t.numeric("net_amount").default("0"),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Committee Members
// ══════════════════════════════════════════════════════════════════════════════

/** Committee member record — PK (pid, memberAddress). Created on CommitteeMemberAdded, soft-deleted on Removed */
export const v4CommitteeMembers = onchainTable("v4_committee_members", (t) => ({
  pid: t.integer("pid").notNull(),
  memberAddress: t.text("member_address").notNull(),
  isActive: t.boolean("is_active").default(true),
  addedAt: t.timestamp("added_at", { withTimezone: true }).$defaultFn(() => new Date()),
  removedAt: t.timestamp("removed_at", { withTimezone: true }),
}), (table) => ({
  pk: primaryKey({ columns: [table.pid, table.memberAddress] }),
}));

/** Committee dispute vote — PK (disputeId, memberAddress) */
export const v4CommitteeDisputeVotes = onchainTable("v4_committee_dispute_votes", (t) => ({
  disputeId: t.integer("dispute_id").notNull(),
  memberAddress: t.text("member_address").notNull(),
  upholdDispute: t.boolean("uphold_dispute").notNull(),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.disputeId, table.memberAddress] }),
}));

/** Committee milestone vote — PK (milestoneId, memberAddress) */
export const v4CommitteeMilestoneVotes = onchainTable("v4_committee_milestone_votes", (t) => ({
  milestoneId: t.integer("milestone_id").notNull(),
  memberAddress: t.text("member_address").notNull(),
  approve: t.boolean("approve").notNull(),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
}), (table) => ({
  pk: primaryKey({ columns: [table.milestoneId, table.memberAddress] }),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Bounty Hunter Profiles
// ══════════════════════════════════════════════════════════════════════════════

/** BH profile — PK address. Tracks cooldown, wins/losses, flagging */
export const v4BountyHunters = onchainTable("v4_bounty_hunters", (t) => ({
  address: t.text("address").primaryKey(),
  totalDisputes: t.integer("total_disputes").default(0),
  totalWins: t.integer("total_wins").default(0),
  totalLosses: t.integer("total_losses").default(0),
  totalRewards: t.numeric("total_rewards").default("0"),
  isFlagged: t.boolean("is_flagged").default(false),
  cooldownUntil: t.timestamp("cooldown_until", { withTimezone: true }),
  createdAt: t.timestamp("created_at", { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: t.timestamp("updated_at", { withTimezone: true }).$defaultFn(() => new Date()),
}));

// ══════════════════════════════════════════════════════════════════════════════
// RELATIONS (best-effort — @ponder/client / graphql read convenience only,
// not enforced as FK constraints since pid is not a DB-level foreign key here)
// ══════════════════════════════════════════════════════════════════════════════

export const v4ApplicantRelations = relations(v4Applicants, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Applicants.pid], references: [v4Programs.pid] }),
}));

export const v4ScholarRelations = relations(v4Scholars, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Scholars.pid], references: [v4Programs.pid] }),
}));

export const v4MilestoneRelations = relations(v4Milestones, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Milestones.pid], references: [v4Programs.pid] }),
}));

export const v4VoteRelations = relations(v4Votes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Votes.pid], references: [v4Programs.pid] }),
}));

export const v4DisputeRelations = relations(v4Disputes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Disputes.pid], references: [v4Programs.pid] }),
}));

export const v4ConfidenceStakeRelations = relations(v4ConfidenceStakes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4ConfidenceStakes.pid], references: [v4Programs.pid] }),
}));

export const v4DonationRelations = relations(v4Donations, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Donations.pid], references: [v4Programs.pid] }),
}));

export const v4CommitteeMemberRelations = relations(v4CommitteeMembers, ({ one }) => ({
  program: one(v4Programs, { fields: [v4CommitteeMembers.pid], references: [v4Programs.pid] }),
}));
