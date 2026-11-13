import { Injectable, Singleton } from "hono-forge";
import { eq, or, and, desc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

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
      applicantRows,
      scholarRows,
      milestones,
      votes,
      stakes,
      disputes,
      [reputation],
      committeeMemberships,
    ] = await Promise.all([
      ponderClient.db.select().from(v4Programs)
        .where(onChain(v4Programs, eq(v4Programs.initiator, wallet)))
        .orderBy(desc(v4Programs.createdAt)),

      // Plain selects. Joining programs onto these returned program columns that came back null or
      // shifted through the Ponder client (the dashboard showed "No Program" for an active scholar),
      // so the programs are fetched once below and attached here.
      ponderClient.db.select().from(v4Applicants)
        .where(onChain(v4Applicants, eq(v4Applicants.wallet, wallet)))
        .orderBy(desc(v4Applicants.createdAt)),

      ponderClient.db.select().from(v4Scholars)
        .where(onChain(v4Scholars, eq(v4Scholars.wallet, wallet)))
        .orderBy(desc(v4Scholars.createdAt)),

      ponderClient.db.select().from(v4Milestones)
        .where(onChain(v4Milestones, eq(v4Milestones.scholarWallet, wallet)))
        .orderBy(v4Milestones.blockchainId),

      ponderClient.db.select().from(v4Votes)
        .where(onChain(v4Votes, eq(v4Votes.voterAddress, wallet)))
        .orderBy(desc(v4Votes.createdAt)),

      ponderClient.db.select().from(v4ConfidenceStakes)
        .where(onChain(v4ConfidenceStakes, eq(v4ConfidenceStakes.voterAddress, wallet)))
        .orderBy(desc(v4ConfidenceStakes.createdAt)),

      ponderClient.db.select().from(v4Disputes)
        .where(onChain(v4Disputes, or(
          eq(v4Disputes.bountyHunter, wallet),
          eq(v4Disputes.scholarAddress, wallet),
        )))
        .orderBy(desc(v4Disputes.createdAt)),

      ponderClient.db.select().from(v4Reputation)
        .where(onChain(v4Reputation, eq(v4Reputation.address, wallet)))
        .limit(1),

      // Memberships only. Joining the two whole tables here returned program rows whose
      // columns were shifted (pid came back null, so the dashboard showed "Program #null"),
      // so the programs are fetched separately below.
      ponderClient.db.select().from(v4CommitteeMembers)
        .where(onChain(v4CommitteeMembers,
          eq(v4CommitteeMembers.memberAddress, wallet),
          eq(v4CommitteeMembers.isActive, true),
        ))
        .orderBy(desc(v4CommitteeMembers.addedAt)),
    ]);

    const committeePids = [...new Set(committeeMemberships.map((m) => m.pid))];

    // Every program this wallet touches, in one query.
    const wantedPids = [...new Set([
      ...applicantRows.map((a) => a.pid),
      ...scholarRows.map((s) => s.pid),
      ...committeePids,
    ])];
    const programRows = wantedPids.length === 0
      ? []
      : await ponderClient.db.select().from(v4Programs)
          .where(onChain(v4Programs, or(...wantedPids.map((pid) => eq(v4Programs.pid, pid)))))
          .orderBy(desc(v4Programs.createdAt));
    const programOf = (pid: number) => programRows.find((p) => p.pid === pid) ?? null;

    const applications = applicantRows.map((applicant) => ({ applicant, program: programOf(applicant.pid) }));
    const scholarships = scholarRows.map((scholar) => ({ scholar, program: programOf(scholar.pid) }));
    const committeePrograms = programRows.filter((p) => committeePids.includes(p.pid));

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
