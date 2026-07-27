import { Injectable, Singleton } from "hono-forge";
import { eq, or, and, desc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const {
  v4Programs, v4Applicants, v4Scholars,
  v4Milestones, v4Votes, v4Disputes,
  v4Reputation, v4ConfidenceStakes,
  v4CommitteeMembers,
} = ponderSchema;

@Injectable()
@Singleton()
export class DashboardService {
  /**
   * Aggregated dashboard data for a wallet — every role the wallet has in
   * the protocol: initiator, applicant, scholar, voter, disputant, committee
   * member. Source of truth is entirely Ponder-indexed on-chain state.
   */
  async forWallet(wallet: string) {
    const [
      programsCreated,
      applications,
      scholarships,
      milestones,
      votes,
      stakes,
      disputes,
      [reputation],
      committeeMemberships,
    ] = await Promise.all([
      ponderClient.db.select().from(v4Programs)
        .where(eq(v4Programs.initiator, wallet))
        .orderBy(desc(v4Programs.createdAt)),

      ponderClient.db.select({
        applicant: v4Applicants,
        program: {
          pid: v4Programs.pid,
          metadataCID: v4Programs.metadataCID,
          status: v4Programs.status,
          totalFund: v4Programs.totalFund,
        },
      })
        .from(v4Applicants)
        .leftJoin(v4Programs, eq(v4Applicants.pid, v4Programs.pid))
        .where(eq(v4Applicants.wallet, wallet))
        .orderBy(desc(v4Applicants.createdAt)),

      ponderClient.db.select({
        scholar: v4Scholars,
        program: {
          pid: v4Programs.pid,
          metadataCID: v4Programs.metadataCID,
          status: v4Programs.status,
          totalFund: v4Programs.totalFund,
        },
      })
        .from(v4Scholars)
        .leftJoin(v4Programs, eq(v4Scholars.pid, v4Programs.pid))
        .where(eq(v4Scholars.wallet, wallet))
        .orderBy(desc(v4Scholars.createdAt)),

      ponderClient.db.select().from(v4Milestones)
        .where(eq(v4Milestones.scholarWallet, wallet))
        .orderBy(v4Milestones.blockchainId),

      ponderClient.db.select().from(v4Votes)
        .where(eq(v4Votes.voterAddress, wallet))
        .orderBy(desc(v4Votes.createdAt)),

      ponderClient.db.select().from(v4ConfidenceStakes)
        .where(eq(v4ConfidenceStakes.voterAddress, wallet))
        .orderBy(desc(v4ConfidenceStakes.createdAt)),

      ponderClient.db.select().from(v4Disputes)
        .where(or(
          eq(v4Disputes.bountyHunter, wallet),
          eq(v4Disputes.scholarAddress, wallet),
        ))
        .orderBy(desc(v4Disputes.createdAt)),

      ponderClient.db.select().from(v4Reputation)
        .where(eq(v4Reputation.address, wallet))
        .limit(1),

      ponderClient.db.select({
        membership: v4CommitteeMembers,
        program: v4Programs,
      })
        .from(v4CommitteeMembers)
        .innerJoin(v4Programs, eq(v4CommitteeMembers.pid, v4Programs.pid))
        .where(and(
          eq(v4CommitteeMembers.memberAddress, wallet),
          eq(v4CommitteeMembers.isActive, true),
        ))
        .orderBy(desc(v4CommitteeMembers.addedAt)),
    ]);

    const committeePrograms = committeeMemberships.map((m) => m.program);

    const totalReceived = scholarships.reduce(
      (sum, s) => sum + BigInt(s.scholar.totalReceived ?? "0"), 0n
    );

    const totalCreatedFund = programsCreated.reduce(
      (sum, p) => sum + BigInt(p.totalFund ?? "0"), 0n
    );

    return {
      wallet,
      summary: {
        programsCreatedCount: programsCreated.length,
        applicationsCount: applications.length,
        scholarshipsCount: scholarships.length,
        votesCount: votes.length,
        disputesCount: disputes.length,
        committeeProgramsCount: committeePrograms.length,
        totalFundReceived: String(totalReceived),
        totalFundCreated: String(totalCreatedFund),
        repBalance: reputation?.repBalance ?? "0",
      },
      programsCreated,
      applications,
      scholarships,
      milestones,
      votes,
      stakes,
      disputes,
      reputation: reputation ?? null,
      committeePrograms,
    };
  }
}
