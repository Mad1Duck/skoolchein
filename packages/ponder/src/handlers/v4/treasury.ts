import { ponder } from "ponder:registry";
import { v4Programs, v4Donations, v4ConfidenceStakes, v4BountyHunters, v4Reputation, v4TreasuryWithdrawals } from "ponder:schema";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";
import { upsertReputation, programTokenOf } from "./helpers";

export const scholarshipTreasuryHandlers = () => {

  // ── FundDeposited — initiator depositing funds into program ────────────

  ponder.on("ScholarshipTreasury:FundDeposited", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, depositor, amount } = event.args;

      const prog = await db.find(v4Programs, { pid: Number(pid) });

      if (prog) {
        const prev = BigInt(prog.totalFund ?? "0");
        await db.update(v4Programs, { pid: Number(pid) })
          .set({ totalFund: String(prev + BigInt(amount)), updatedAt: new Date() });
      }

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:FundDeposited" });
      await sendSseToAll("main", { step: "FundDeposited", data: { pid, depositor, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "FundDeposited handler error");
    }
  });

  // ── DonationRecorded — individual donor donation tracked ──────────────

  ponder.on("ScholarshipTreasury:DonationRecorded", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, donor, netAmount } = event.args;

      const donationToken = await programTokenOf(db, Number(pid));
      await db.insert(v4Donations).values({
        transactionHash: event.transaction.hash,
        pid: Number(pid),
        token: donationToken,
        donor: String(donor),
        netAmount: String(netAmount),
      }).onConflictDoNothing();

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:DonationRecorded" });
      await sendSseToAll("main", { step: "DonationRecorded", data: { pid, donor, netAmount: String(netAmount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "DonationRecorded handler error");
    }
  });

  // ── MilestoneDisbursed — funds sent to scholar on milestone approval ───

  ponder.on("ScholarshipTreasury:MilestoneDisbursed", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, scholar, milestoneId, amount } = event.args;

      const prog = await db.find(v4Programs, { pid: Number(pid) });

      if (prog) {
        const prev = BigInt(prog.spentFund ?? "0");
        await db.update(v4Programs, { pid: Number(pid) })
          .set({ spentFund: String(prev + BigInt(amount)), updatedAt: new Date() });
      }

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:MilestoneDisbursed" });
      await sendSseToAll("main", { step: "MilestoneDisbursed", data: { pid, scholar, milestoneId, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "MilestoneDisbursed handler error");
    }
  });

  // ── SlashDistributed — funds redistributed after slash ─────────────────

  ponder.on("ScholarshipTreasury:SlashDistributed", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, scholar, bountyHunter, bhReward, treasuryAmount, protocolAmount } = event.args;

      const bh = await db.find(v4BountyHunters, { address: String(bountyHunter) });

      if (bh) {
        const prevRewards = BigInt(bh.totalRewards ?? "0");
        await db.update(v4BountyHunters, { address: String(bountyHunter) })
          .set({
            totalRewards: String(prevRewards + BigInt(bhReward)),
            totalWins: (bh.totalWins ?? 0) + 1,
            updatedAt: new Date(),
          });
      }

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:SlashDistributed" });
      await sendSseToAll("main", { step: "SlashDistributed", data: { pid, scholar, bountyHunter, bhReward: String(bhReward) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "SlashDistributed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:ConfidenceStakeDeposited", async ({ event, context }) => {
    try {
      await insertBlock({ db: context.db, event, eventName: "ScholarshipTreasury:ConfidenceStakeDeposited" });
    } catch (err) {
      logger.error({ err }, "ConfidenceStakeDeposited handler error");
    }
  });

  // ── ConfidenceStakeResolved — settle confidence stakes ────────────────

  ponder.on("ScholarshipTreasury:ConfidenceStakeResolved", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, voter, returned, bonus, slashed } = event.args;
      await db.update(v4ConfidenceStakes, { pid: Number(pid), voterAddress: String(voter) })
        .set({
          isResolved: true,
          wasSlashed: slashed,
          returnedAmount: String(returned),
          bonusAmount: String(bonus),
          updatedAt: new Date(),
        });

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:ConfidenceStakeResolved" });
      await sendSseToAll("main", { step: "ConfidenceStakeResolved", data: { pid, voter, slashed }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ConfidenceStakeResolved handler error");
    }
  });

  // ── YieldAdded — DeFi yield accrued to program ────────────────────────

  ponder.on("ScholarshipTreasury:YieldAdded", async ({ event, context }) => {
    try {
      const { db } = context;
      const { pid, amount } = event.args;

      const prog = await db.find(v4Programs, { pid: Number(pid) });

      if (prog) {
        const prev = BigInt(prog.yieldAccrued ?? "0");
        await db.update(v4Programs, { pid: Number(pid) })
          .set({ yieldAccrued: String(prev + BigInt(amount)), updatedAt: new Date() });
      }

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:YieldAdded" });
    } catch (err) {
      logger.error({ err }, "YieldAdded handler error");
    }
  });

  ponder.on("ScholarshipTreasury:YieldDistributed", async ({ event, context }) => {
    try {
      const { pid, totalYield } = event.args;
      await insertBlock({ db: context.db, event, eventName: "ScholarshipTreasury:YieldDistributed" });
      await sendSseToAll("main", { step: "YieldDistributed", data: { pid, totalYield: String(totalYield) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "YieldDistributed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:YieldClaimed", async ({ event, context }) => {
    try {
      const { pid, voter, amount } = event.args;
      await insertBlock({ db: context.db, event, eventName: "ScholarshipTreasury:YieldClaimed" });
      await sendSseToAll("main", { step: "YieldClaimed", data: { pid, voter, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "YieldClaimed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:DonorRefunded", async ({ event, context }) => {
    try {
      const { pid, donor, amount } = event.args;
      await insertBlock({ db: context.db, event, eventName: "ScholarshipTreasury:DonorRefunded" });
      await sendSseToAll("main", { step: "DonorRefunded", data: { pid, donor, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "DonorRefunded handler error");
    }
  });

  ponder.on("ScholarshipTreasury:TreasuryReserveWithdrawn", async ({ event, context }) => {
    try {
      const { db } = context;
      const { token, recipient, amount } = event.args;

      await db.insert(v4TreasuryWithdrawals).values({
        transactionHash: event.transaction.hash,
        token: String(token).toLowerCase(),
        recipient: String(recipient),
        amount: String(amount),
        timestamp: new Date(Number(event.block.timestamp) * 1000),
      }).onConflictDoNothing();

      await insertBlock({ db, event, eventName: "ScholarshipTreasury:TreasuryReserveWithdrawn" });
      await sendSseToAll("main", { step: "TreasuryReserveWithdrawn", data: { token, recipient, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "TreasuryReserveWithdrawn handler error");
    }
  });
};

export const scholarshipReputationHandlers = () => {

  ponder.on("ScholarshipReputation:ReputationMinted", async ({ event, context }) => {
    try {
      const { db } = context;
      const { to, amount } = event.args;
      await upsertReputation(db, String(to), BigInt(amount), true);
      await insertBlock({ db, event, eventName: "ScholarshipReputation:ReputationMinted" });
    } catch (err) {
      logger.error({ err }, "ReputationMinted handler error");
    }
  });

  ponder.on("ScholarshipReputation:ReputationBurned", async ({ event, context }) => {
    try {
      const { db } = context;
      const { from, amount } = event.args;
      await upsertReputation(db, String(from), BigInt(amount), false);
      await insertBlock({ db, event, eventName: "ScholarshipReputation:ReputationBurned" });
    } catch (err) {
      logger.error({ err }, "ReputationBurned handler error");
    }
  });

  ponder.on("ScholarshipReputation:VotingPowerLocked", async ({ event, context }) => {
    try {
      const { db } = context;
      const { voter, lockedUntil } = event.args;
      const lockDate = new Date(Number(lockedUntil) * 1000);

      const existing = await db.find(v4Reputation, { address: String(voter) });
      if (!existing) {
        await db.insert(v4Reputation).values({ address: String(voter), votingLockedUntil: lockDate });
      } else {
        await db.update(v4Reputation, { address: String(voter) })
          .set({ votingLockedUntil: lockDate, updatedAt: new Date() });
      }
    } catch (err) {
      logger.error({ err }, "VotingPowerLocked handler error");
    }
  });
};
