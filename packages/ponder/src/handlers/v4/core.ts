import { ponder } from "ponder:registry";
import { db } from "@/db";
import { v4Programs, v4Applicants, v4Scholars, v4Votes, v4ConfidenceStakes, v4Reputation, v4FraudNfts } from "@/db/schema";
import { scholarshipCoreAbi } from "abis/v4/ScholarshipCore";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/api/controller/sse.controller";
import { eq, and, sql } from "drizzle-orm";
import { findProgramUuid, toDate } from "./helpers";

export const scholarshipCoreHandlers = () => {

  // ── Phase 0: Program Created ─────────────────────────────────────────────

  ponder.on("ScholarshipCore:ProgramCreated", async ({ event, context: ctx }) => {
    try {
      const { pid, initiator, metadataCID } = event.args;

      const prog: any = await ctx.client.readContract({
        abi: scholarshipCoreAbi,
        address: event.log.address as `0x${string}`,
        functionName: "getProgram",
        args: [pid],
      });

      await db.insert(v4Programs).values({
        pid: Number(pid),
        initiator: String(initiator),
        metadataCID: String(metadataCID),
        status: "CREATED",
        totalFund: String(prog.totalFund),
        targetWinners: Number(prog.targetWinners),
        maxCandidates: Number(prog.maxCandidates),
        educationLevel: Number(prog.educationLevel),
        screeningMode: Number(prog.screeningMode),
        applicationStart: toDate(prog.applicationStart),
        applicationEnd: toDate(prog.applicationEnd),
        votingStart: toDate(prog.votingStart),
        votingEnd: toDate(prog.votingEnd),
        openDonation: Boolean(prog.openDonation),
      }).onConflictDoUpdate({
        target: [v4Programs.pid],
        set: {
          metadataCID: String(metadataCID),
          totalFund: String(prog.totalFund),
          targetWinners: Number(prog.targetWinners),
          maxCandidates: Number(prog.maxCandidates),
          educationLevel: Number(prog.educationLevel),
          screeningMode: Number(prog.screeningMode),
          applicationStart: toDate(prog.applicationStart),
          applicationEnd: toDate(prog.applicationEnd),
          votingStart: toDate(prog.votingStart),
          votingEnd: toDate(prog.votingEnd),
          openDonation: Boolean(prog.openDonation),
          updatedAt: new Date(),
        },
      });

      await insertBlock({ event, eventName: "ScholarshipCore:ProgramCreated" });
      await sendSseToAll("main", { step: "ProgramCreated", data: { pid: Number(pid), initiator }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProgramCreated handler error");
    }
  });

  // ── Program Status Changed ─────────────────────────────────────────────

  ponder.on("ScholarshipCore:ProgramStatusChanged", async ({ event }) => {
    try {
      const { pid, newStatus } = event.args;
      const statusMap: Record<number, NonNullable<typeof v4Programs.$inferInsert["status"]>> = {
        0: "CREATED", 1: "APPLICATION_OPEN", 2: "SCREENING",
        3: "VOTING", 4: "ACTIVE", 5: "COMPLETED", 6: "CANCELLED",
      };
      const status = statusMap[Number(newStatus)] ?? "CREATED";

      await db.update(v4Programs)
        .set({ status, updatedAt: new Date() })
        .where(eq(v4Programs.pid, Number(pid)));

      await insertBlock({ event, eventName: "ScholarshipCore:ProgramStatusChanged" });
      await sendSseToAll("main", { step: "ProgramStatusChanged", data: { pid: Number(pid), status }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProgramStatusChanged handler error");
    }
  });

  ponder.on("ScholarshipCore:OpenDonationToggled", async ({ event }) => {
    try {
      const { pid, open } = event.args;
      await db.update(v4Programs)
        .set({ openDonation: open, updatedAt: new Date() })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", { step: "OpenDonationToggled", data: { pid: Number(pid), open }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "OpenDonationToggled handler error");
    }
  });

  // ── Committee Assigned ─────────────────────────────────────────────────

  ponder.on("ScholarshipCore:CommitteeAssigned", async ({ event }) => {
    try {
      const { pid, committeeContract } = event.args;
      await db.insert(v4Programs)
        .values({
          pid: Number(pid),
          initiator: "",
          committeeContract: String(committeeContract),
        })
        .onConflictDoUpdate({
          target: [v4Programs.pid],
          set: { committeeContract: String(committeeContract), updatedAt: new Date() },
        });
    } catch (err) {
      logger.error({ err }, "CommitteeAssigned handler error");
    }
  });

  // ── Phase 1: Donation ─────────────────────────────────────────────────

  ponder.on("ScholarshipCore:DonationReceived", async ({ event }) => {
    try {
      const { pid, donor, grossAmount, netAmount } = event.args;
      logger.info({ pid, donor }, "DonationReceived");

      const [prog] = await db.select({ totalFund: v4Programs.totalFund })
        .from(v4Programs)
        .where(eq(v4Programs.pid, Number(pid)))
        .limit(1);

      if (prog) {
        const prevFund = BigInt(prog.totalFund ?? "0");
        await db.update(v4Programs)
          .set({ totalFund: String(prevFund + BigInt(netAmount)), updatedAt: new Date() })
          .where(eq(v4Programs.pid, Number(pid)));
      }

      await db.insert(v4Reputation).values({
        address: String(donor).toLowerCase(),
        remainingVotingPower: String(netAmount),
      }).onConflictDoUpdate({
        target: [v4Reputation.address],
        set: {
          remainingVotingPower: sql`remaining_voting_power + ${String(netAmount)}`,
          updatedAt: new Date(),
        },
      });

      await insertBlock({ event, eventName: "ScholarshipCore:DonationReceived" });
      await sendSseToAll("main", { step: "DonationReceived", data: { pid: Number(pid), donor, grossAmount: String(grossAmount), netAmount: String(netAmount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "DonationReceived handler error");
    }
  });

  ponder.on("ScholarshipCore:ProtocolFeeCollected", async ({ event }) => {
    try {
      const { pid, donor, feeAmount } = event.args;
      logger.info({ pid, donor, feeAmount: feeAmount.toString() }, "ProtocolFeeCollected");

      const [prog] = await db.select({ protocolFeeCollected: v4Programs.protocolFeeCollected })
        .from(v4Programs)
        .where(eq(v4Programs.pid, Number(pid)))
        .limit(1);

      if (prog) {
        const prevFee = BigInt(prog.protocolFeeCollected ?? "0");
        await db.update(v4Programs)
          .set({ protocolFeeCollected: String(prevFee + BigInt(feeAmount)), updatedAt: new Date() })
          .where(eq(v4Programs.pid, Number(pid)));
      }

      await insertBlock({ event, eventName: "ScholarshipCore:ProtocolFeeCollected" });
      await sendSseToAll("main", { step: "ProtocolFeeCollected", data: { pid, donor, feeAmount: String(feeAmount) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProtocolFeeCollected handler error");
    }
  });

  // ── Phase 2: Application ──────────────────────────────────────────────

  ponder.on("ScholarshipCore:StudentApplied", async ({ event }) => {
    try {
      const { pid, student, retryCount } = event.args;
      const progUuid = await findProgramUuid(Number(pid));

      await db.insert(v4Applicants).values({
        id: progUuid ?? undefined,
        pid: Number(pid),
        wallet: String(student),
        retryCount: Number(retryCount),
      }).onConflictDoUpdate({
        target: [v4Applicants.wallet, v4Applicants.pid],
        set: { retryCount: Number(retryCount), updatedAt: new Date() },
      });

      await db.update(v4Programs)
        .set({
          applicantCount: sql`(SELECT COUNT(*) FROM v4_applicants WHERE pid = ${Number(pid)})`,
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await insertBlock({ event, eventName: "ScholarshipCore:StudentApplied" });
      await sendSseToAll("main", { step: "StudentApplied", data: { pid: Number(pid), student }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "StudentApplied handler error");
    }
  });

  ponder.on("ScholarshipCore:ScoreSubmitted", async ({ event }) => {
    try {
      const { pid, student, totalScore } = event.args;
      await db.update(v4Applicants)
        .set({ screeningScore: String(totalScore), totalScore: String(totalScore), updatedAt: new Date() })
        .where(and(
          eq(v4Applicants.pid, Number(pid)),
          eq(v4Applicants.wallet, String(student)),
        ));

      await insertBlock({ event, eventName: "ScholarshipCore:ScoreSubmitted" });
    } catch (err) {
      logger.error({ err }, "ScoreSubmitted handler error");
    }
  });

  ponder.on("ScholarshipCore:StudentScreenedOut", async ({ event }) => {
    try {
      const { pid, student, score, locked } = event.args;
      await db.update(v4Applicants)
        .set({
          status: locked ? "LOCKED" : "SCREENED_OUT",
          screeningScore: String(score),
          updatedAt: new Date(),
        })
        .where(and(
          eq(v4Applicants.pid, Number(pid)),
          eq(v4Applicants.wallet, String(student)),
        ));

      await db.update(v4Programs)
        .set({
          resolveProgress: sql`resolve_progress + 1`,
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await insertBlock({ event, eventName: "ScholarshipCore:StudentScreenedOut" });
    } catch (err) {
      logger.error({ err }, "StudentScreenedOut handler error");
    }
  });

  ponder.on("ScholarshipCore:StudentShortlisted", async ({ event }) => {
    try {
      const { pid, student, score } = event.args;
      await db.update(v4Applicants)
        .set({ status: "SHORTLISTED", screeningScore: String(score), updatedAt: new Date() })
        .where(and(
          eq(v4Applicants.pid, Number(pid)),
          eq(v4Applicants.wallet, String(student)),
        ));

      await db.update(v4Programs)
        .set({
          shortlistedCount: sql`(SELECT COUNT(*) FROM v4_applicants WHERE pid = ${Number(pid)} AND status = 'SHORTLISTED')`,
          resolveProgress: sql`resolve_progress + 1`,
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await insertBlock({ event, eventName: "ScholarshipCore:StudentShortlisted" });
      await sendSseToAll("main", { step: "StudentShortlisted", data: { pid: Number(pid), student }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "StudentShortlisted handler error");
    }
  });

  // ── Phase 3: Voting ───────────────────────────────────────────────────

  ponder.on("ScholarshipCore:VoteCast", async ({ event }) => {
    try {
      const { pid, voter, candidate, weight, useReputation } = event.args;
      const progUuid = await findProgramUuid(Number(pid));

      await db.insert(v4Votes).values({
        id: progUuid ?? undefined,
        pid: Number(pid),
        voterAddress: String(voter).toLowerCase(),
        candidateAddress: String(candidate).toLowerCase(),
        votingWeight: String(weight),
      }).onConflictDoUpdate({
        target: [v4Votes.voterAddress, v4Votes.pid],
        set: { candidateAddress: String(candidate).toLowerCase(), votingWeight: String(weight) },
      });

      if (!useReputation) {
        await db.update(v4Reputation)
          .set({
            remainingVotingPower: sql`remaining_voting_power - ${String(weight)}`,
            updatedAt: new Date(),
          })
          .where(eq(v4Reputation.address, String(voter).toLowerCase()));
      }

      await insertBlock({ event, eventName: "ScholarshipCore:VoteCast" });
      await sendSseToAll("main", { step: "VoteCast", data: { pid: Number(pid), voter, candidate }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "VoteCast handler error");
    }
  });

  ponder.on("ScholarshipCore:ConfidenceStaked", async ({ event }) => {
    try {
      const { pid, voter, scholar, amount } = event.args;
      const progUuid = await findProgramUuid(Number(pid));

      await db.insert(v4ConfidenceStakes).values({
        id: progUuid ?? undefined,
        pid: Number(pid),
        voterAddress: String(voter),
        scholarAddress: String(scholar),
        amount: String(amount),
      }).onConflictDoUpdate({
        target: [v4ConfidenceStakes.voterAddress, v4ConfidenceStakes.pid],
        set: { amount: String(amount), updatedAt: new Date() },
      });

      await insertBlock({ event, eventName: "ScholarshipCore:ConfidenceStaked" });
    } catch (err) {
      logger.error({ err }, "ConfidenceStaked handler error");
    }
  });

  // ── Phase 4: Scholar Selected ─────────────────────────────────────────

  ponder.on("ScholarshipCore:ScholarSelected", async ({ event, context: ctx }) => {
    try {
      const { pid, scholar } = event.args;
      const progUuid = await findProgramUuid(Number(pid));

      await db.insert(v4Scholars).values({
        id: progUuid ?? undefined,
        pid: Number(pid),
        wallet: String(scholar),
        status: "ACTIVE",
      }).onConflictDoUpdate({
        target: [v4Scholars.wallet, v4Scholars.pid],
        set: { status: "ACTIVE", updatedAt: new Date() },
      });

      const progSync: any = await ctx.client.readContract({
        abi: scholarshipCoreAbi,
        address: event.log.address as `0x${string}`,
        functionName: "getProgram",
        args: [pid],
      });

      await db.update(v4Programs)
        .set({
          activeScholarCount: sql`(SELECT COUNT(*) FROM v4_scholars WHERE pid = ${Number(pid)} AND status = 'ACTIVE')`,
          allocatedFund: String(progSync.allocatedFund),
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await insertBlock({ event, eventName: "ScholarshipCore:ScholarSelected" });
      await sendSseToAll("main", { step: "ScholarSelected", data: { pid, scholar }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ScholarSelected handler error");
    }
  });

  // ── Slash / Complete ──────────────────────────────────────────────────

  ponder.on("ScholarshipCore:ScholarSlashed", async ({ event }) => {
    try {
      const { scholar, pid, dtype } = event.args;
      const statusMap: Record<number, NonNullable<typeof v4Scholars.$inferInsert["status"]>> = {
        0: "FROZEN", 1: "FROZEN", 2: "BLACKLISTED",
      };
      const status = statusMap[Number(dtype)] ?? "FROZEN";

      await db.update(v4Scholars)
        .set({
          status,
          isBlacklisted: Number(dtype) === 2,
          updatedAt: new Date(),
        })
        .where(and(
          eq(v4Scholars.wallet, String(scholar)),
          eq(v4Scholars.pid, Number(pid)),
        ));

      // Record Fraud NFT if it's a heavy fraud
      if (Number(dtype) === 2) {
        await db.insert(v4FraudNfts).values({
          scholarWallet: String(scholar),
          pid: Number(pid),
          metadataUri: "ipfs://QmFraudAlertMetadata",
        });
      }

      await insertBlock({ event, eventName: "ScholarshipCore:ScholarSlashed" });
      await sendSseToAll("main", { step: "ScholarSlashed", data: { scholar, pid: Number(pid), isHeavy: Number(dtype) === 2 }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ScholarSlashed handler error");
    }
  });

  ponder.on("ScholarshipCore:ScholarCompleted", async ({ event }) => {
    try {
      const { pid, scholar } = event.args;
      await db.update(v4Scholars)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(and(
          eq(v4Scholars.wallet, String(scholar)),
          eq(v4Scholars.pid, Number(pid)),
        ));

      await sendSseToAll("main", { step: "ScholarCompleted", data: { pid: Number(pid), scholar }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ScholarCompleted handler error");
    }
  });

  ponder.on("ScholarshipCore:ProgramCompleted", async ({ event }) => {
    try {
      const { pid } = event.args;
      await db.update(v4Programs)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", { step: "ProgramCompleted", data: { pid: Number(pid) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProgramCompleted handler error");
    }
  });

  ponder.on("ScholarshipCore:ProgramCancelled", async ({ event }) => {
    try {
      const { pid } = event.args;
      await db.update(v4Programs)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", { step: "ProgramCancelled", data: { pid: Number(pid) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProgramCancelled handler error");
    }
  });

  // ── Date Management ──────────────────────────────────────────────────────────

  ponder.on("ScholarshipCore:ApplicationDeadlineExtended", async ({ event }) => {
    try {
      const { pid, newEnd } = event.args;
      await db.update(v4Programs)
        .set({
          applicationEnd: new Date(Number(newEnd) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", {
        step: "ApplicationDeadlineExtended",
        data: { pid: Number(pid), newEnd: Number(newEnd) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "ApplicationDeadlineExtended handler error");
    }
  });

  ponder.on("ScholarshipCore:VotingDeadlineExtended", async ({ event }) => {
    try {
      const { pid, newEnd } = event.args;
      await db.update(v4Programs)
        .set({
          votingEnd: new Date(Number(newEnd) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", {
        step: "VotingDeadlineExtended",
        data: { pid: Number(pid), newEnd: Number(newEnd) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "VotingDeadlineExtended handler error");
    }
  });

  ponder.on("ScholarshipCore:AdminBypassStatusForced", async ({ event }) => {
    try {
      const { pid, newStatus } = event.args;
      const statusMap: Record<number, NonNullable<typeof v4Programs.$inferInsert["status"]>> = {
        0: "CREATED", 1: "APPLICATION_OPEN", 2: "SCREENING",
        3: "VOTING", 4: "ACTIVE", 5: "COMPLETED", 6: "CANCELLED",
      };
      const status = statusMap[Number(newStatus)] ?? "CREATED";

      await db.update(v4Programs)
        .set({ status, updatedAt: new Date() })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", {
        step: "AdminBypassStatusForced",
        data: { pid: Number(pid), status },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "AdminBypassStatusForced handler error");
    }
  });

  ponder.on("ScholarshipCore:AdminBypassDatesUpdated", async ({ event }) => {
    try {
      const { pid, appStart, appEnd, voteStart, voteEnd } = event.args;
      await db.update(v4Programs)
        .set({
          applicationStart: new Date(Number(appStart) * 1000),
          applicationEnd: new Date(Number(appEnd) * 1000),
          votingStart: new Date(Number(voteStart) * 1000),
          votingEnd: new Date(Number(voteEnd) * 1000),
          updatedAt: new Date(),
        })
        .where(eq(v4Programs.pid, Number(pid)));

      await sendSseToAll("main", {
        step: "AdminBypassDatesUpdated",
        data: { pid: Number(pid) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "AdminBypassDatesUpdated handler error");
    }
  });
};
