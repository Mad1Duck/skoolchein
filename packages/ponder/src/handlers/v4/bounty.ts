import { ponder } from "ponder:registry";
import { v4Disputes, v4BountyHunters } from "ponder:schema";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";
import { upsertBountyHunter, programTokenOf } from "./helpers";

export const scholarshipBountyHandlers = () => {

  ponder.on("ScholarshipBounty:DisputeRaised", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { disputeId, pid, scholar, bountyHunter, disputeType, evidenceCID, stake, potentialReward } = event.args;

    const typeMap: Record<number, NonNullable<typeof v4Disputes.$inferInsert["disputeType"]>> = {
      0: "LIGHT_FRAUD", 1: "MILESTONE_FRAUD", 2: "HEAVY_FRAUD",
    };

    const disputeToken = await programTokenOf(db, chainId, Number(pid));
    const raised = {
      pid: Number(pid),
      token: disputeToken,
      scholarAddress: String(scholar),
      bountyHunter: String(bountyHunter),
      disputeType: typeMap[Number(disputeType)] ?? "LIGHT_FRAUD",
      status: "ACTIVE" as const,
      evidenceCID: String(evidenceCID),
      stake: String(stake),
      potentialReward: String(potentialReward),
      raisedAt: new Date(Number(event.block.timestamp) * 1000),
    };
    // The row already exists when GriefingStakeApplied came first.
    await db.insert(v4Disputes).values({ chainId, blockchainId: Number(disputeId), ...raised })
      .onConflictDoUpdate({ ...raised, updatedAt: new Date() });

    // Upsert BH profile
    await upsertBountyHunter(db, chainId, String(bountyHunter));

    await insertBlock({ db, chainId, event, eventName: "ScholarshipBounty:DisputeRaised" });
    await sendSseToAll("main", { chainId, step: "DisputeRaised", data: { disputeId, scholar, bountyHunter }, status: true, blockHash: event.block.hash });
  });

  ponder.on("ScholarshipBounty:StudentDefended", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { disputeId, counterEvidenceCID } = event.args;
    await context.db.update(v4Disputes, { chainId, blockchainId: Number(disputeId) })
      .set({ counterEvidenceCID: String(counterEvidenceCID), updatedAt: new Date() });

    await sendSseToAll("main", { chainId, step: "StudentDefended", data: { disputeId }, status: true, blockHash: event.block.hash });
  });

  ponder.on("ScholarshipBounty:StudentConceded", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { disputeId } = event.args;
    await context.db.update(v4Disputes, { chainId, blockchainId: Number(disputeId) })
      .set({ status: "STUDENT_CONCEDED", resolvedAt: new Date(), updatedAt: new Date() });

    await sendSseToAll("main", { chainId, step: "StudentConceded", data: { disputeId }, status: true, blockHash: event.block.hash });
  });

  ponder.on("ScholarshipBounty:DisputeAutoGuilty", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { disputeId } = event.args;
    await context.db.update(v4Disputes, { chainId, blockchainId: Number(disputeId) })
      .set({ status: "AUTO_GUILTY", resolvedAt: new Date(), updatedAt: new Date() });

    await sendSseToAll("main", { chainId, step: "DisputeAutoGuilty", data: { disputeId }, status: true, blockHash: event.block.hash });
  });

  ponder.on("ScholarshipBounty:DisputeResolved", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { disputeId, bountyHunterWon, bhReward } = event.args;
    const dispute = await db.update(v4Disputes, { chainId, blockchainId: Number(disputeId) })
      .set({
        status: bountyHunterWon ? "BH_WON" : "BH_LOST",
        bhRewardPaid: String(bhReward),
        resolvedAt: new Date(),
        updatedAt: new Date(),
      });

    // Losses only: an upheld report is counted as a win when its SlashDistributed event arrives.
    const bh = await db.find(v4BountyHunters, { chainId, address: dispute.bountyHunter });

    if (bh) {
      await db.update(v4BountyHunters, { chainId, address: dispute.bountyHunter })
        .set({
          totalLosses: !bountyHunterWon ? (bh.totalLosses ?? 0) + 1 : bh.totalLosses,
          updatedAt: new Date(),
        });
    }

    await sendSseToAll("main", { chainId, step: "DisputeResolved", data: { disputeId, bountyHunterWon }, status: true, blockHash: event.block.hash });
  });

   ponder.on("ScholarshipBounty:GriefingStakeApplied", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { disputeId, originalStake, appliedStake } = event.args;

    const late = {
      isLateDispute: true,
      griefingStakeOriginal: String(originalStake),
      stake: String(appliedStake),
    };
    // Contracts deployed before the event order was fixed emit this ahead of DisputeRaised, in the same
    // transaction. DisputeRaised then fills in the placeholders.
    await db.insert(v4Disputes).values({ chainId,
      blockchainId: Number(disputeId),
      scholarAddress: "",
      bountyHunter: "",
      disputeType: "MILESTONE_FRAUD",
      ...late,
    }).onConflictDoUpdate({ ...late, updatedAt: new Date() });

    await insertBlock({ db, chainId, event, eventName: "ScholarshipBounty:GriefingStakeApplied" });
    await sendSseToAll("main", { chainId, step: "GriefingStakeApplied", data: { disputeId: Number(disputeId), appliedStake: String(appliedStake) }, status: true, blockHash: event.block.hash });
  });

  ponder.on("ScholarshipBounty:BHFlagged", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { bountyHunter, cooldownUntil } = event.args;
    const cooldownDate = new Date(Number(cooldownUntil) * 1000);

    const existing = await db.find(v4BountyHunters, { chainId, address: String(bountyHunter) });

    if (existing) {
      await db.update(v4BountyHunters, { chainId, address: String(bountyHunter) })
        .set({ isFlagged: true, cooldownUntil: cooldownDate, updatedAt: new Date() });
    } else {
      await db.insert(v4BountyHunters).values({ chainId,
        address: String(bountyHunter),
        isFlagged: true,
        cooldownUntil: cooldownDate,
      });
    }

    await insertBlock({ db, chainId, event, eventName: "ScholarshipBounty:BHFlagged" });
    await sendSseToAll("main", { chainId, step: "BHFlagged", data: { bountyHunter, cooldownUntil: cooldownDate.toISOString() }, status: true, blockHash: event.block.hash });
  });
};
