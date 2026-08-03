import { ponder } from "ponder:registry";
import { v4Milestones, v4Scholars, v4Programs } from "ponder:schema";
import { scholarshipCoreAbi } from "abis/v4/ScholarshipCore";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";
import { hexToString } from "viem";
import { programTokenOf } from "./helpers";

const decodeBytes32 = (value: `0x${string}`) =>
  /^0x0+$/.test(value) ? "" : hexToString(value, { size: 32 }).replace(/\0/g, "");

export const milestoneManagerHandlers = () => {

  // ── MilestoneCreated — Core calls createMandatoryBatch() at selectWinners ─

  ponder.on("MilestoneManager:MilestoneCreated", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, pid, scholar, kind } = event.args;
      const mId = Number(id);

      const kindMap: Record<number, "MANDATORY" | "OPTIONAL" | "NEGOTIATED"> = {
        0: "MANDATORY", 1: "OPTIONAL", 2: "NEGOTIATED",
      };
      const kindStr = kindMap[Number(kind)] ?? "MANDATORY";
      const provider = decodeBytes32(event.args.provider);
      const externalId = decodeBytes32(event.args.externalId);

      const token = await programTokenOf(db, Number(pid));
      await db.insert(v4Milestones).values({
        blockchainId: mId,
        pid: Number(pid),
        token,
        scholarWallet: String(scholar),
        kind: kindStr,
        requiresProof: kindStr !== "MANDATORY",
        provider,
        externalId,
        status: "PENDING",
      }).onConflictDoUpdate({
        kind: kindStr,
        requiresProof: kindStr !== "MANDATORY",
        provider,
        externalId,
        status: "PENDING",
        updatedAt: new Date(),
      });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneCreated" });
      await sendSseToAll("main", {
        step: "MilestoneCreated",
        data: { milestoneId: mId, pid: Number(pid), scholar, kind: kindStr },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneCreated handler error");
    }
  });

  // ── MilestoneProposed — scholar proposes OPTIONAL or NEGOTIATED milestone ─

  ponder.on("MilestoneManager:MilestoneProposed", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, pid, scholar, kind } = event.args;
      const mId = Number(id);

      const kindMap: Record<number, "MANDATORY" | "OPTIONAL" | "NEGOTIATED"> = {
        0: "MANDATORY", 1: "OPTIONAL", 2: "NEGOTIATED",
      };
      const kindStr = kindMap[Number(kind)] ?? "OPTIONAL";
      const provider = decodeBytes32(event.args.provider);
      const externalId = decodeBytes32(event.args.externalId);

      const token = await programTokenOf(db, Number(pid));
      await db.insert(v4Milestones).values({
        blockchainId: mId,
        pid: Number(pid),
        token,
        scholarWallet: String(scholar),
        kind: kindStr,
        requiresProof: kindStr !== "MANDATORY",
        proposedBy: String(scholar),
        provider,
        externalId,
        status: "PROPOSED",
      }).onConflictDoUpdate({
        status: "PROPOSED",
        requiresProof: kindStr !== "MANDATORY",
        proposedBy: String(scholar),
        provider,
        externalId,
        updatedAt: new Date(),
      });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneProposed" });
      await sendSseToAll("main", {
        step: "MilestoneProposed",
        data: { milestoneId: mId, pid: Number(pid), scholar, kind: kindStr },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneProposed handler error");
    }
  });

  // ── MilestoneApproved — committee approves OPTIONAL/NEGOTIATED proposal ──

  ponder.on("MilestoneManager:MilestoneApproved", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, approvedBy } = event.args;

      const milestone = await db.update(v4Milestones, { blockchainId: Number(id) })
        .set({ status: "PENDING", approvedBy: String(approvedBy), updatedAt: new Date() });

      if (milestone.pid) {
        const coreAddress = await context.client.readContract({
          abi: [{ "inputs": [], "name": "_coreContract", "outputs": [{ "internalType": "contract IScholarshipCoreMin", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],
          address: event.log.address as `0x${string}`,
          functionName: "_coreContract"
        });
        const progSync: any = await context.client.readContract({
          abi: scholarshipCoreAbi,
          address: coreAddress as `0x${string}`,
          functionName: "getProgram",
          args: [BigInt(milestone.pid)],
        });
        await db.update(v4Programs, { pid: milestone.pid })
          .set({ allocatedFund: String(progSync.allocatedFund), updatedAt: new Date() });
      }

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneApproved" });
      await sendSseToAll("main", {
        step: "MilestoneApproved",
        data: { milestoneId: Number(id), approvedBy },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneApproved handler error");
    }
  });

  // ── MilestoneRejected — committee menolak proposal ────────────────────

  ponder.on("MilestoneManager:MilestoneRejected", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, rejectedBy } = event.args;

      await db.update(v4Milestones, { blockchainId: Number(id) })
        .set({ status: "REJECTED", approvedBy: String(rejectedBy), updatedAt: new Date() });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneRejected" });
      await sendSseToAll("main", {
        step: "MilestoneRejected",
        data: { milestoneId: Number(id), rejectedBy },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneRejected handler error");
    }
  });

  // ── MilestoneSubmitted — scholar submit proof untuk milestone PENDING ─

  ponder.on("MilestoneManager:MilestoneSubmitted", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, scholar, proofCID } = event.args;
      const mId = Number(id);
      const submittedAt = new Date(Number(event.block.timestamp) * 1000);

      await db.update(v4Milestones, { blockchainId: mId })
        .set({
          proofCID: String(proofCID),
          status: "SUBMITTED",
          submittedAt,
          updatedAt: new Date(),
        });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneSubmitted" });
      await sendSseToAll("main", {
        step: "MilestoneSubmitted",
        data: { milestoneId: mId, scholar },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneSubmitted handler error");
    }
  });

  // ── MilestoneCompleted — dispute window lewat, executeMilestone() dipanggil ─

  ponder.on("MilestoneManager:MilestoneCompleted", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id, scholar, amount } = event.args;
      const mId = Number(id);

      const milestone = await db.update(v4Milestones, { blockchainId: mId })
        .set({
          status: "COMPLETED",
          amount: String(amount),
          completedAt: new Date(),
          updatedAt: new Date(),
        });

      if (milestone.pid && milestone.scholarWallet) {
        const existingScholar = await db.find(v4Scholars, { pid: milestone.pid, wallet: milestone.scholarWallet });

        if (existingScholar) {
          const prev = BigInt(existingScholar.totalReceived ?? "0");
          await db.update(v4Scholars, { pid: milestone.pid, wallet: milestone.scholarWallet })
            .set({ totalReceived: String(prev + BigInt(amount)), updatedAt: new Date() });
        }

        const coreAddress = await context.client.readContract({
          abi: [{ "inputs": [], "name": "_coreContract", "outputs": [{ "internalType": "contract IScholarshipCoreMin", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }],
          address: event.log.address as `0x${string}`,
          functionName: "_coreContract"
        });
        const progSync: any = await context.client.readContract({
          abi: scholarshipCoreAbi,
          address: coreAddress as `0x${string}`,
          functionName: "getProgram",
          args: [BigInt(milestone.pid)],
        });
        await db.update(v4Programs, { pid: milestone.pid })
          .set({
            spentFund: String(progSync.spentFund),
            allocatedFund: String(progSync.allocatedFund),
            updatedAt: new Date(),
          });
      }

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneCompleted" });
      await sendSseToAll("main", {
        step: "MilestoneCompleted",
        data: { milestoneId: mId, scholar, amount: String(amount) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneCompleted handler error");
    }
  });

  // ── MilestoneFrozen — ScholarshipBounty panggil freezeMilestone() ─────

  ponder.on("MilestoneManager:MilestoneFrozen", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id } = event.args;
      await db.update(v4Milestones, { blockchainId: Number(id) })
        .set({ status: "FROZEN", updatedAt: new Date() });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneFrozen" });
      await sendSseToAll("main", {
        step: "MilestoneFrozen",
        data: { milestoneId: Number(id) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneFrozen handler error");
    }
  });

  // ── MilestoneReleased — dispute selesai, milestone kembali ke SUBMITTED ─

  ponder.on("MilestoneManager:MilestoneReleased", async ({ event, context }) => {
    try {
      const { db } = context;
      const { id } = event.args;
      await db.update(v4Milestones, { blockchainId: Number(id) })
        .set({ status: "SUBMITTED", updatedAt: new Date() });

      await insertBlock({ db, event, eventName: "MilestoneManager:MilestoneReleased" });
      await sendSseToAll("main", {
        step: "MilestoneReleased",
        data: { milestoneId: Number(id) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "MilestoneManager:MilestoneReleased handler error");
    }
  });
};
