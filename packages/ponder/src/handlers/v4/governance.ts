import { ponder } from "ponder:registry";
import { v4CommitteeMembers, v4CommitteeDisputeVotes, v4CommitteeMilestoneVotes } from "ponder:schema";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";

export const committeeGovernanceHandlers = () => {

  // ── CommitteeMemberAdded — new member assigned to program committee ────

  ponder.on("CommitteeGovernance:CommitteeMemberAdded", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { pid, member } = event.args;

    await db.insert(v4CommitteeMembers).values({ chainId,
      pid: Number(pid),
      memberAddress: String(member),
      isActive: true,
    }).onConflictDoUpdate({ isActive: true, removedAt: null, addedAt: new Date() });

    await insertBlock({ db, chainId, event, eventName: "CommitteeGovernance:CommitteeMemberAdded" });
    await sendSseToAll("main", { chainId, step: "CommitteeMemberAdded", data: { pid, member }, status: true, blockHash: event.block.hash });
  });

  // ── CommitteeMemberRemoved — member removed from program committee ────

  ponder.on("CommitteeGovernance:CommitteeMemberRemoved", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { pid, member } = event.args;

    await db.update(v4CommitteeMembers, { chainId, pid: Number(pid), memberAddress: String(member) })
      .set({ isActive: false, removedAt: new Date() });

    await insertBlock({ db, chainId, event, eventName: "CommitteeGovernance:CommitteeMemberRemoved" });
    await sendSseToAll("main", { chainId, step: "CommitteeMemberRemoved", data: { pid, member }, status: true, blockHash: event.block.hash });
  });

  // ── ScoreSubmitted — committee member submitted a score for an applicant ─

  ponder.on("CommitteeGovernance:ScoreSubmitted", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { pid, applicant, score } = event.args;

    // No applicant write here. `score` is one member's raw academic score; the applicant's real score is
    // in Core's ScoreSubmitted, emitted once a majority has scored. A member may also score an address
    // that never applied, so there may be no row at all.
    await insertBlock({ db, chainId, event, eventName: "CommitteeGovernance:ScoreSubmitted" });
    await sendSseToAll("main", { chainId, step: "ScoreSubmitted", data: { pid, applicant, score: String(score) }, status: true, blockHash: event.block.hash });
  });

  // ── DisputeVoteCast — individual committee member votes on dispute ─────

  ponder.on("CommitteeGovernance:DisputeVoteCast", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { disputeId, member, upholdDispute } = event.args;

    await db.insert(v4CommitteeDisputeVotes).values({ chainId,
      disputeId: Number(disputeId),
      memberAddress: String(member),
      upholdDispute: upholdDispute,
    }).onConflictDoUpdate({ upholdDispute: upholdDispute });

    await insertBlock({ db, chainId, event, eventName: "CommitteeGovernance:DisputeVoteCast" });
    await sendSseToAll("main", { chainId, step: "DisputeVoteCast", data: { disputeId, member, upholdDispute }, status: true, blockHash: event.block.hash });
  });

  // ── MilestoneVoteCast — committee member votes on optional milestone ───

  ponder.on("CommitteeGovernance:MilestoneVoteCast", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { db } = context;
    const { milestoneId, member, approve } = event.args;

    await db.insert(v4CommitteeMilestoneVotes).values({ chainId,
      milestoneId: Number(milestoneId),
      memberAddress: String(member),
      approve: approve,
    }).onConflictDoUpdate({ approve: approve });

    await insertBlock({ db, chainId, event, eventName: "CommitteeGovernance:MilestoneVoteCast" });
    await sendSseToAll("main", { chainId, step: "MilestoneVoteCast", data: { milestoneId, member, approve }, status: true, blockHash: event.block.hash });
  });

  // ── MilestoneVoteResolved — committee majority reached on milestone ────

  ponder.on("CommitteeGovernance:MilestoneVoteResolved", async ({ event, context }) => {
    const chainId = context.chain.id;
    const { milestoneId, approved } = event.args;

    await insertBlock({ db: context.db, chainId, event, eventName: "CommitteeGovernance:MilestoneVoteResolved" });
    await sendSseToAll("main", { chainId, step: "MilestoneVoteResolved", data: { milestoneId, approved }, status: true, blockHash: event.block.hash });
  });
};
