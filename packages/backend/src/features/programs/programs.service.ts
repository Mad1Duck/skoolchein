import { Injectable, Singleton } from "hono-forge";
import { eq, and, desc, asc, count } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const { v4Programs, v4Applicants, v4Scholars, v4Milestones, v4Votes, v4Disputes } = ponderSchema;

@Injectable()
@Singleton()
export class ProgramsService {
  async list(opts: { status?: string; initiator?: string; limit: number; offset: number; sort: "asc" | "desc" }) {
    const conditions = [];
    if (opts.status) conditions.push(eq(v4Programs.status, opts.status as any));
    if (opts.initiator) conditions.push(eq(v4Programs.initiator, opts.initiator));
    const where = conditions.length ? and(...conditions) : undefined;
    const sortFn = opts.sort === "asc" ? asc : desc;

    const [data, [total]] = await Promise.all([
      ponderClient.db.select().from(v4Programs)
        .where(where)
        .orderBy(sortFn(v4Programs.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
      ponderClient.db.select({ value: count() }).from(v4Programs).where(where),
    ]);

    return { data, total: Number(total?.value ?? 0) };
  }

  async getByPid(pid: number) {
    const [program] = await ponderClient.db.select().from(v4Programs).where(eq(v4Programs.pid, pid)).limit(1);
    if (!program) return null;

    const [[applicants], [scholars], [milestones], [votes], [disputes]] = await Promise.all([
      ponderClient.db.select({ value: count() }).from(v4Applicants).where(eq(v4Applicants.pid, pid)),
      ponderClient.db.select({ value: count() }).from(v4Scholars).where(eq(v4Scholars.pid, pid)),
      ponderClient.db.select({ value: count() }).from(v4Milestones).where(eq(v4Milestones.pid, pid)),
      ponderClient.db.select({ value: count() }).from(v4Votes).where(eq(v4Votes.pid, pid)),
      ponderClient.db.select({ value: count() }).from(v4Disputes).where(eq(v4Disputes.pid, pid)),
    ]);

    return {
      ...program,
      _counts: {
        applicants: Number(applicants?.value ?? 0),
        scholars: Number(scholars?.value ?? 0),
        milestones: Number(milestones?.value ?? 0),
        votes: Number(votes?.value ?? 0),
        disputes: Number(disputes?.value ?? 0),
      },
    };
  }

  async applicantsForProgram(pid: number, limit: number, offset: number) {
    return ponderClient.db.select().from(v4Applicants)
      .where(eq(v4Applicants.pid, pid))
      .orderBy(desc(v4Applicants.totalScore))
      .limit(limit).offset(offset);
  }

  async scholarsForProgram(pid: number, limit: number, offset: number) {
    return ponderClient.db.select().from(v4Scholars)
      .where(eq(v4Scholars.pid, pid))
      .orderBy(desc(v4Scholars.createdAt))
      .limit(limit).offset(offset);
  }

  async milestonesForProgram(pid: number, limit: number, offset: number) {
    return ponderClient.db.select().from(v4Milestones)
      .where(eq(v4Milestones.pid, pid))
      .orderBy(asc(v4Milestones.blockchainId))
      .limit(limit).offset(offset);
  }

  async votesForProgram(pid: number, limit: number, offset: number) {
    return ponderClient.db.select().from(v4Votes)
      .where(eq(v4Votes.pid, pid))
      .orderBy(desc(v4Votes.createdAt))
      .limit(limit).offset(offset);
  }

  async disputesForProgram(pid: number) {
    return ponderClient.db.select().from(v4Disputes)
      .where(eq(v4Disputes.pid, pid))
      .orderBy(desc(v4Disputes.createdAt));
  }
}
