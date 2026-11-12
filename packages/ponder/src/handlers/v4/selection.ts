import { ponder } from "ponder:registry";
import { v4Programs, v4Recommendations } from "ponder:schema";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";

/**
 * ScholarshipSelection: ranks the shortlist and chooses winners.
 *
 * The outcomes themselves (StudentShortlisted, ScholarSelected, MilestoneCreated, status changes)
 * are still emitted by ScholarshipCore / MilestoneManager and handled there. These handlers only
 * record what the creator configured and push live updates.
 */
export const scholarshipSelectionHandlers = () => {

  // ── ProgramConfigured: the creator chose a vote weight and a milestone plan ───

  ponder.on("ScholarshipSelection:ProgramConfigured", async ({ event, context }) => {
    try {
      const chainId = context.chain.id;
      const { db } = context;
      const { pid, voteWeightBps, milestoneCount } = event.args;

      await db.update(v4Programs, { chainId, pid: Number(pid) }).set({
        voteWeightBps: Number(voteWeightBps),
        milestonePlanCount: Number(milestoneCount),
        updatedAt: new Date(),
      });

      await insertBlock({ db, chainId, event, eventName: "ScholarshipSelection:ProgramConfigured" });
      await sendSseToAll("main", { chainId, step: "ProgramConfigured", data: { pid: Number(pid) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ProgramConfigured handler error");
    }
  });

  // ── RecommendationSubmitted: a recommender's signature was accepted ───────────

  ponder.on("ScholarshipSelection:RecommendationSubmitted", async ({ event, context }) => {
    try {
      const chainId = context.chain.id;
      const { db } = context;
      const { pid, student, recommender, score } = event.args;

      await db.insert(v4Recommendations).values({
        chainId,
        pid: Number(pid),
        student: String(student),
        recommender: String(recommender),
        score: Number(score),
      }).onConflictDoUpdate({ score: Number(score) });

      await insertBlock({ db, chainId, event, eventName: "ScholarshipSelection:RecommendationSubmitted" });
      // Core also emits ScoreSubmitted in the same transaction, which refreshes the applicant's scores.
      await sendSseToAll("main", { chainId, step: "RecommendationSubmitted", data: { pid: Number(pid), student: String(student) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "RecommendationSubmitted handler error");
    }
  });

  // ── RecommendersConfigured: the creator restricted (or reopened) who may recommend ─

  ponder.on("ScholarshipSelection:RecommendersConfigured", async ({ event, context }) => {
    try {
      const chainId = context.chain.id;
      const { db } = context;
      const { pid, restricted } = event.args;

      await db.update(v4Programs, { chainId, pid: Number(pid) }).set({
        recommendersRestricted: Boolean(restricted),
        updatedAt: new Date(),
      });

      await insertBlock({ db, chainId, event, eventName: "ScholarshipSelection:RecommendersConfigured" });
      await sendSseToAll("main", { chainId, step: "RecommendersConfigured", data: { pid: Number(pid) }, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "RecommendersConfigured handler error");
    }
  });

  // ── WinnersSelected: the program is now ACTIVE ────────────────────────────────

  ponder.on("ScholarshipSelection:WinnersSelected", async ({ event, context }) => {
    try {
      const chainId = context.chain.id;
      const { db } = context;
      const { pid, winners, bySystem } = event.args;

      await insertBlock({ db, chainId, event, eventName: "ScholarshipSelection:WinnersSelected" });
      await sendSseToAll("main", {
        chainId,
        step: "WinnersSelected",
        data: { pid: Number(pid), winners: winners.map(String), bySystem },
        status: true,
        blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "WinnersSelected handler error");
    }
  });

  // ── ConfigUpdated: an admin changed the selection settings ───────────────────

  ponder.on("ScholarshipSelection:ConfigUpdated", async ({ event, context }) => {
    try {
      const chainId = context.chain.id;
      const { db } = context;
      await insertBlock({ db, chainId, event, eventName: "ScholarshipSelection:ConfigUpdated" });
      await sendSseToAll("main", { chainId, step: "SelectionConfigUpdated", data: {}, status: true, blockHash: event.block.hash });
    } catch (err) {
      logger.error({ err }, "ConfigUpdated handler error");
    }
  });
};
