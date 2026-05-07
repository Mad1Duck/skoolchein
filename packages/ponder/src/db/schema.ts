import { pgTable, varchar, text, integer, numeric, timestamp, uuid, boolean, unique, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ══════════════════════════════════════════════════════════════════════════════

export const programStatusEnum = pgEnum("program_status", ["CREATED", "APPLICATION_OPEN", "SCREENING", "VOTING", "ACTIVE", "COMPLETED", "CANCELLED"]);
export const disputeTypeEnum = pgEnum("dispute_type", ["LIGHT_FRAUD", "MILESTONE_FRAUD", "HEAVY_FRAUD"]);
export const disputeStatusEnum = pgEnum("dispute_status", ["ACTIVE", "STUDENT_CONCEDED", "AUTO_GUILTY", "BH_WON", "BH_LOST"]);
export const studentStatusEnum = pgEnum("student_status", ["ACTIVE", "COMPLETED", "FROZEN", "BLACKLISTED"]);
export const milestoneStatusEnum = pgEnum("milestone_status", ["PENDING", "PROPOSED", "SUBMITTED", "DISPUTED", "COMPLETED", "FROZEN", "REJECTED"]);
export const applicationStatusEnum = pgEnum("application_status", ["PENDING_REVIEW", "SHORTLISTED", "SCREENED_OUT", "LOCKED"]);

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM TABLES
// ══════════════════════════════════════════════════════════════════════════════

/** Tracks the last indexed block per event for reorg safety and resume. */
export const indexedBlocks = pgTable("indexed_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventName: varchar("event_name", { length: 255 }).default(""),
  blockNumber: integer("block_number").unique().default(0),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Programs
// ══════════════════════════════════════════════════════════════════════════════

/** Full v4 program record — created on ProgramCreated, updated on ProgramStatusChanged */
export const v4Programs = pgTable("v4_programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pid: integer("pid").notNull().unique(),
  initiator: varchar("initiator", { length: 42 }).notNull(),
  metadataCID: varchar("metadata_cid", { length: 255 }).default(""),
  status: programStatusEnum("status").default("CREATED"),
  educationLevel: integer("education_level").default(0),
  screeningMode: integer("screening_mode").default(0),
  maxCandidates: integer("max_candidates").default(0),
  targetWinners: integer("target_winners").default(0),
  committeeContract: varchar("committee_contract", { length: 42 }).default(""),
  totalFund: numeric("total_fund").default("0"),
  allocatedFund: numeric("allocated_fund").default("0"),
  spentFund: numeric("spent_fund").default("0"),
  yieldAccrued: numeric("yield_accrued").default("0"),
  protocolFeeCollected: numeric("protocol_fee_collected").default("0"),
  applicantCount: integer("applicant_count").default(0),
  shortlistedCount: integer("shortlisted_count").default(0),
  activeScholarCount: integer("active_scholar_count").default(0),
  applicationStart: timestamp("application_start", { withTimezone: true }),
  applicationEnd: timestamp("application_end", { withTimezone: true }),
  votingStart: timestamp("voting_start", { withTimezone: true }),
  votingEnd: timestamp("voting_end", { withTimezone: true }),
  openDonation: boolean("open_donation").default(true),
  resolveProgress: integer("resolve_progress").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Applicants & Scholars
// ══════════════════════════════════════════════════════════════════════════════

/** Applicant row — updated on ScoreSubmitted, StudentShortlisted, StudentScreenedOut */
export const v4Applicants = pgTable("v4_applicants", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  wallet: varchar("wallet", { length: 42 }).notNull(),
  status: applicationStatusEnum("status").default("PENDING_REVIEW"),
  profileCID: varchar("profile_cid", { length: 255 }).default(""),
  documentCID: varchar("document_cid", { length: 255 }).default(""),
  essayCID: varchar("essay_cid", { length: 255 }).default(""),
  screeningScore: numeric("screening_score").default("0"),
  totalScore: numeric("total_score").default("0"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqApplicant: unique().on(t.wallet, t.pid),
}));

/** Active scholar — created on ScholarSelected, updated on milestones + fraud */
export const v4Scholars = pgTable("v4_scholars", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  wallet: varchar("wallet", { length: 42 }).notNull(),
  status: studentStatusEnum("status").default("ACTIVE"),
  freezeUntil: timestamp("freeze_until", { withTimezone: true }),
  isBlacklisted: boolean("is_blacklisted").default(false),
  currentMilestone: integer("current_milestone").default(0),
  totalMilestones: integer("total_milestones").default(0),
  totalReceived: numeric("total_received").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqScholar: unique().on(t.wallet, t.pid),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Milestones
// ══════════════════════════════════════════════════════════════════════════════

/** Milestone row — created on MilestoneSubmitted, updated on Completed/Frozen/Released */
export const v4Milestones = pgTable("v4_milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  blockchainId: integer("blockchain_id").notNull().unique(),
  programId: uuid("program_id").references(() => v4Programs.id),
  scholarId: uuid("scholar_id").references(() => v4Scholars.id),
  scholarWallet: varchar("scholar_wallet", { length: 42 }),
  kind: varchar("kind", { length: 20 }).default("MANDATORY"), // MANDATORY | OPTIONAL | NEGOTIATED
  requiresProof: boolean("requires_proof").default(false),
  amount: numeric("amount").default("0"),
  proofCID: varchar("proof_cid", { length: 255 }).default(""),
  status: milestoneStatusEnum("status").default("PENDING"),
  proposedBy: varchar("proposed_by", { length: 42 }),  // wallet that proposed (OPTIONAL/NEGOTIATED)
  approvedBy: varchar("approved_by", { length: 42 }),  // wallet that approved/rejected
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  disputeDeadline: timestamp("dispute_deadline", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  provider: varchar("provider", { length: 66 }),
  externalId: varchar("external_id", { length: 66 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Voting & Confidence Stakes
// ══════════════════════════════════════════════════════════════════════════════

/** Donor vote — one per donor per program, created on VoteCast */
export const v4Votes = pgTable("v4_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  voterAddress: varchar("voter_address", { length: 42 }).notNull(),
  candidateAddress: varchar("candidate_address", { length: 42 }).notNull(),
  votingWeight: numeric("voting_weight").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqVote: unique().on(t.voterAddress, t.pid),
}));

/** Optional confidence stake — created on ConfidenceStaked, resolved on ConfidenceStakeResolved */
export const v4ConfidenceStakes = pgTable("v4_confidence_stakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  voterAddress: varchar("voter_address", { length: 42 }).notNull(),
  scholarAddress: varchar("scholar_address", { length: 42 }).notNull(),
  amount: numeric("amount").default("0"),
  isResolved: boolean("is_resolved").default(false),
  wasSlashed: boolean("was_slashed").default(false),
  returnedAmount: numeric("returned_amount").default("0"),
  bonusAmount: numeric("bonus_amount").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqStake: unique().on(t.voterAddress, t.pid),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Disputes
// ══════════════════════════════════════════════════════════════════════════════

/** Bounty hunter dispute — created on DisputeRaised, updated through resolution */
export const v4Disputes = pgTable("v4_disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  blockchainId: integer("blockchain_id").notNull().unique(),
  programId: uuid("program_id").references(() => v4Programs.id),
  milestoneId: integer("milestone_id"),       // 0 = program-level dispute
  scholarAddress: varchar("scholar_address", { length: 42 }).notNull(),
  bountyHunter: varchar("bounty_hunter", { length: 42 }).notNull(),
  disputeType: disputeTypeEnum("dispute_type").notNull(),
  status: disputeStatusEnum("status").default("ACTIVE"),
  evidenceCID: varchar("evidence_cid", { length: 255 }).default(""),
  counterEvidenceCID: varchar("counter_evidence_cid", { length: 255 }).default(""),
  stake: numeric("stake").default("0"),
  potentialReward: numeric("potential_reward").default("0"),
  bhRewardPaid: numeric("bh_reward_paid").default("0"),
  raisedAt: timestamp("raised_at", { withTimezone: true }),
  defenseDeadline: timestamp("defense_deadline", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  isLateDispute: boolean("is_late_dispute").default(false),
  griefingStakeOriginal: numeric("griefing_stake_original").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Reputation (Soulbound Token)
// ══════════════════════════════════════════════════════════════════════════════

/** REP balance per address — upserted on ReputationMinted / ReputationBurned */
export const v4Reputation = pgTable("v4_reputation", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: varchar("address", { length: 42 }).notNull().unique(),
  repBalance: numeric("rep_balance").default("0"),
  totalMinted: numeric("total_minted").default("0"),
  totalBurned: numeric("total_burned").default("0"),
  remainingVotingPower: numeric("remaining_voting_power").default("0"),
  votingLockedUntil: timestamp("voting_locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** Tracks manual withdrawals of slashed funds from Treasury */
export const v4TreasuryWithdrawals = pgTable("v4_treasury_withdrawals", {
  id: uuid("id").defaultRandom().primaryKey(),
  recipient: varchar("recipient", { length: 42 }).notNull(),
  amount: numeric("amount").default("0"),
  transactionHash: varchar("tx_hash", { length: 66 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Donations
// ══════════════════════════════════════════════════════════════════════════════

/** Individual donation record — created on Treasury:DonationRecorded */
export const v4Donations = pgTable("v4_donations", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  donor: varchar("donor", { length: 42 }).notNull(),
  grossAmount: numeric("gross_amount").default("0"),
  netAmount: numeric("net_amount").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Committee Members
// ══════════════════════════════════════════════════════════════════════════════

/** Committee member record — created on CommitteeMemberAdded, soft-deleted on Removed */
export const v4CommitteeMembers = pgTable("v4_committee_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  programId: uuid("program_id").references(() => v4Programs.id),
  pid: integer("pid").notNull(),
  memberAddress: varchar("member_address", { length: 42 }).notNull(),
  isActive: boolean("is_active").default(true),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
}, (t) => ({
  uniqMember: unique().on(t.memberAddress, t.pid),
}));

/** Committee dispute vote — tracks individual member votes on disputes */
export const v4CommitteeDisputeVotes = pgTable("v4_committee_dispute_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  disputeId: integer("dispute_id").notNull(),
  memberAddress: varchar("member_address", { length: 42 }).notNull(),
  upholdDispute: boolean("uphold_dispute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqVote: unique().on(t.disputeId, t.memberAddress),
}));

/** Committee milestone vote — tracks individual member votes on optional milestone proposals */
export const v4CommitteeMilestoneVotes = pgTable("v4_committee_milestone_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  milestoneId: integer("milestone_id").notNull(),
  memberAddress: varchar("member_address", { length: 42 }).notNull(),
  approve: boolean("approve").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqMilestoneVote: unique().on(t.milestoneId, t.memberAddress),
}));

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — Bounty Hunter Profiles
// ══════════════════════════════════════════════════════════════════════════════

/** BH profile — tracks cooldown, wins/losses, flagging */
export const v4BountyHunters = pgTable("v4_bounty_hunters", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: varchar("address", { length: 42 }).notNull().unique(),
  totalDisputes: integer("total_disputes").default(0),
  totalWins: integer("total_wins").default(0),
  totalLosses: integer("total_losses").default(0),
  totalRewards: numeric("total_rewards").default("0"),
  isFlagged: boolean("is_flagged").default(false),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ══════════════════════════════════════════════════════════════════════════════
// V4 TABLES — External Learning Progress
// ══════════════════════════════════════════════════════════════════════════════

/** Tracks progress from 3rd party platforms (HackQuest/Udemy) via Webhooks */
export const v4ExternalLearning = pgTable("v4_external_learning", {
  id: uuid("id").defaultRandom().primaryKey(),
  address: varchar("address", { length: 42 }).notNull(),
  provider: varchar("provider", { length: 66 }).notNull(), // hex bytes32
  externalId: varchar("external_id", { length: 66 }).notNull(), // hex bytes32
  progress: integer("progress").default(0),
  status: varchar("status", { length: 20 }).default("IN_PROGRESS"), // "COMPLETED", "FAILED"
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
}, (t) => ({
  uniqProg: unique().on(t.address, t.provider, t.externalId),
}));

// ══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const v4ProgramRelations = relations(v4Programs, ({ many }) => ({
  applicants: many(v4Applicants),
  scholars: many(v4Scholars),
  milestones: many(v4Milestones),
  votes: many(v4Votes),
  confidenceStakes: many(v4ConfidenceStakes),
  disputes: many(v4Disputes),
  donations: many(v4Donations),
  committeeMembers: many(v4CommitteeMembers),
}));

export const v4ApplicantRelations = relations(v4Applicants, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Applicants.programId], references: [v4Programs.id] }),
}));

export const v4ScholarRelations = relations(v4Scholars, ({ one, many }) => ({
  program: one(v4Programs, { fields: [v4Scholars.programId], references: [v4Programs.id] }),
  milestones: many(v4Milestones),
}));

export const v4MilestoneRelations = relations(v4Milestones, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Milestones.programId], references: [v4Programs.id] }),
  scholar: one(v4Scholars, { fields: [v4Milestones.scholarId], references: [v4Scholars.id] }),
}));

export const v4VoteRelations = relations(v4Votes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Votes.programId], references: [v4Programs.id] }),
}));

export const v4DisputeRelations = relations(v4Disputes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Disputes.programId], references: [v4Programs.id] }),
}));

export const v4ConfidenceStakeRelations = relations(v4ConfidenceStakes, ({ one }) => ({
  program: one(v4Programs, { fields: [v4ConfidenceStakes.programId], references: [v4Programs.id] }),
}));

export const v4DonationRelations = relations(v4Donations, ({ one }) => ({
  program: one(v4Programs, { fields: [v4Donations.programId], references: [v4Programs.id] }),
}));

export const v4CommitteeMemberRelations = relations(v4CommitteeMembers, ({ one }) => ({
  program: one(v4Programs, { fields: [v4CommitteeMembers.programId], references: [v4Programs.id] }),
}));