import { ponder } from "ponder:registry";
import { db } from "@/db";
import { v4Programs, v4Donations, v4ConfidenceStakes, v4BountyHunters, v4Reputation, v4TreasuryWithdrawals } from "@/db/schema";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/api/controller/sse.controller";
import { eq, and } from "drizzle-orm";
import { findProgramUuid, upsertReputation } from "./helpers";

export const scholarshipTreasuryHandlers = () => {

  // ── FundDeposited — initiator depositing funds into program ────────────

  ponder.on("ScholarshipTreasury:FundDeposited", async ({ event }) => {
    try {
      const { pid, depositor, amount } = event.args;

      const [prog] = await db.select({ totalFund: v4Programs.totalFund })
        .from(v4Programs).where(eq(v4Programs.pid, Number(pid))).limit(1);

      if (prog) {
        const prev = BigInt(prog.totalFund ?? "0");
        await db.update(v4Programs)
          .set({ totalFund: String(prev + BigInt(amount)), updatedAt: new Date() })
          .where(eq(v4Programs.pid, Number(pid)));
      }

      await insertBlock({ event, eventName: "ScholarshipTreasury:FundDeposited" });
      await sendSseToAll("main", { step: "FundDeposited", data: { pid, depositor, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "FundDeposited handler error");
    }
  });

  // ── DonationRecorded — individual donor donation tracked ──────────────

  ponder.on("ScholarshipTreasury:DonationRecorded", async ({ event }) => {
    try {
      const { pid, donor, netAmount } = event.args;
      const progUuid = await findProgramUuid(Number(pid));

      await db.insert(v4Donations).values({
        programId: progUuid ?? undefined,
        pid: Number(pid),
        donor: String(donor),
        netAmount: String(netAmount),
      });

      await insertBlock({ event, eventName: "ScholarshipTreasury:DonationRecorded" });
      await sendSseToAll("main", { step: "DonationRecorded", data: { pid, donor, netAmount: String(netAmount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "DonationRecorded handler error");
    }
  });

  // ── MilestoneDisbursed — funds sent to scholar on milestone approval ───

  ponder.on("ScholarshipTreasury:MilestoneDisbursed", async ({ event }) => {
    try {
      const { pid, scholar, milestoneId, amount } = event.args;

      const [prog] = await db.select({ spentFund: v4Programs.spentFund })
        .from(v4Programs).where(eq(v4Programs.pid, Number(pid))).limit(1);

      if (prog) {
        const prev = BigInt(prog.spentFund ?? "0");
        await db.update(v4Programs)
          .set({ spentFund: String(prev + BigInt(amount)), updatedAt: new Date() })
          .where(eq(v4Programs.pid, Number(pid)));
      }

      await insertBlock({ event, eventName: "ScholarshipTreasury:MilestoneDisbursed" });
      await sendSseToAll("main", { step: "MilestoneDisbursed", data: { pid, scholar, milestoneId, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "MilestoneDisbursed handler error");
    }
  });

  // ── SlashDistributed — funds redistributed after slash ─────────────────

  ponder.on("ScholarshipTreasury:SlashDistributed", async ({ event }) => {
    try {
      const { pid, scholar, bountyHunter, bhReward, treasuryAmount, protocolAmount } = event.args;

      const [bh] = await db.select().from(v4BountyHunters)
        .where(eq(v4BountyHunters.address, String(bountyHunter))).limit(1);

      if (bh) {
        const prevRewards = BigInt(bh.totalRewards ?? "0");
        await db.update(v4BountyHunters)
          .set({
            totalRewards: String(prevRewards + BigInt(bhReward)),
            totalWins: (bh.totalWins ?? 0) + 1,
            updatedAt: new Date(),
          })
          .where(eq(v4BountyHunters.address, String(bountyHunter)));
      }

      await insertBlock({ event, eventName: "ScholarshipTreasury:SlashDistributed" });
      await sendSseToAll("main", { step: "SlashDistributed", data: { pid, scholar, bountyHunter, bhReward: String(bhReward) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "SlashDistributed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:ConfidenceStakeDeposited", async ({ event }) => {
    try {
      await insertBlock({ event, eventName: "ScholarshipTreasury:ConfidenceStakeDeposited" });
    } catch (err) {
      logger.error({ err }, "ConfidenceStakeDeposited handler error");
    }
  });

  // ── ConfidenceStakeResolved — settle confidence stakes ────────────────

  ponder.on("ScholarshipTreasury:ConfidenceStakeResolved", async ({ event }) => {
    try {
      const { pid, voter, returned, bonus, slashed } = event.args;
      await db.update(v4ConfidenceStakes)
        .set({
          isResolved: true,
          wasSlashed: slashed,
          returnedAmount: String(returned),
          bonusAmount: String(bonus),
          updatedAt: new Date(),
        })
        .where(and(
          eq(v4ConfidenceStakes.voterAddress, String(voter)),
          eq(v4ConfidenceStakes.pid, Number(pid)),
        ));

      await insertBlock({ event, eventName: "ScholarshipTreasury:ConfidenceStakeResolved" });
      await sendSseToAll("main", { step: "ConfidenceStakeResolved", data: { pid, voter, slashed }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ConfidenceStakeResolved handler error");
    }
  });

  // ── YieldAdded — DeFi yield accrued to program ────────────────────────

  ponder.on("ScholarshipTreasury:YieldAdded", async ({ event }) => {
    try {
      const { pid, amount } = event.args;

      const [prog] = await db.select({ yieldAccrued: v4Programs.yieldAccrued })
        .from(v4Programs).where(eq(v4Programs.pid, Number(pid))).limit(1);

      if (prog) {
        const prev = BigInt(prog.yieldAccrued ?? "0");
        await db.update(v4Programs)
          .set({ yieldAccrued: String(prev + BigInt(amount)), updatedAt: new Date() })
          .where(eq(v4Programs.pid, Number(pid)));
      }

      await insertBlock({ event, eventName: "ScholarshipTreasury:YieldAdded" });
    } catch (err) {
      logger.error({ err }, "YieldAdded handler error");
    }
  });

  ponder.on("ScholarshipTreasury:YieldDistributed", async ({ event }) => {
    try {
      const { pid, totalYield } = event.args;
      await insertBlock({ event, eventName: "ScholarshipTreasury:YieldDistributed" });
      await sendSseToAll("main", { step: "YieldDistributed", data: { pid, totalYield: String(totalYield) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "YieldDistributed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:YieldClaimed", async ({ event }) => {
    try {
      const { pid, voter, amount } = event.args;
      await insertBlock({ event, eventName: "ScholarshipTreasury:YieldClaimed" });
      await sendSseToAll("main", { step: "YieldClaimed", data: { pid, voter, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "YieldClaimed handler error");
    }
  });

  ponder.on("ScholarshipTreasury:DonorRefunded", async ({ event }) => {
    try {
      const { pid, donor, amount } = event.args;
      await insertBlock({ event, eventName: "ScholarshipTreasury:DonorRefunded" });
      await sendSseToAll("main", { step: "DonorRefunded", data: { pid, donor, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "DonorRefunded handler error");
    }
  });

  ponder.on("ScholarshipTreasury:TreasuryReserveWithdrawn", async ({ event }) => {
    try {
      const { recipient, amount } = event.args;
      
      await db.insert(v4TreasuryWithdrawals).values({
        recipient: String(recipient),
        amount: String(amount),
        transactionHash: event.transaction.hash,
        timestamp: new Date(Number(event.block.timestamp) * 1000),
      });

      await insertBlock({ event, eventName: "ScholarshipTreasury:TreasuryReserveWithdrawn" });
      await sendSseToAll("main", { step: "TreasuryReserveWithdrawn", data: { recipient, amount: String(amount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "TreasuryReserveWithdrawn handler error");
    }
  });
};

export const scholarshipReputationHandlers = () => {

  ponder.on("ScholarshipReputation:ReputationMinted", async ({ event }) => {
    try {
      const { to, amount } = event.args;
      await upsertReputation(String(to), BigInt(amount), true);
      await insertBlock({ event, eventName: "ScholarshipReputation:ReputationMinted" });
    } catch (err) {
      logger.error({ err }, "ReputationMinted handler error");
    }
  });

  ponder.on("ScholarshipReputation:ReputationBurned", async ({ event }) => {
    try {
      const { from, amount } = event.args;
      await upsertReputation(String(from), BigInt(amount), false);
      await insertBlock({ event, eventName: "ScholarshipReputation:ReputationBurned" });
    } catch (err) {
      logger.error({ err }, "ReputationBurned handler error");
    }
  });

  ponder.on("ScholarshipReputation:VotingPowerLocked", async ({ event }) => {
    try {
      const { voter, lockedUntil } = event.args;
      const lockDate = new Date(Number(lockedUntil) * 1000);

      const existing = await db.select().from(v4Reputation).where(eq(v4Reputation.address, String(voter))).limit(1);
      if (existing.length === 0) {
        await db.insert(v4Reputation).values({ address: String(voter), votingLockedUntil: lockDate });
      } else {
        await db.update(v4Reputation)
          .set({ votingLockedUntil: lockDate, updatedAt: new Date() })
          .where(eq(v4Reputation.address, String(voter)));
      }
    } catch (err) {
      logger.error({ err }, "VotingPowerLocked handler error");
    }
  });
};
