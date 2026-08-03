import { Injectable, Singleton } from "hono-forge";
import { eq, and, desc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const { v4Applicants, v4Programs } = ponderSchema;

@Injectable()
@Singleton()
export class ApplicantsService {
  async list(opts: { wallet?: string; status?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.wallet) conditions.push(eq(v4Applicants.wallet, opts.wallet));
    if (opts.status) conditions.push(eq(v4Applicants.status, opts.status as any));
    const where = conditions.length ? and(...conditions) : undefined;

    return ponderClient.db.select({
      applicant: v4Applicants,
      program: {
        pid: v4Programs.pid,
        metadataCID: v4Programs.metadataCID,
        token: v4Programs.token,
        status: v4Programs.status,
        initiator: v4Programs.initiator,
        totalFund: v4Programs.totalFund,
      },
    })
      .from(v4Applicants)
      .leftJoin(v4Programs, eq(v4Applicants.pid, v4Programs.pid))
      .where(where)
      .orderBy(desc(v4Applicants.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async getOne(pid: number, wallet: string) {
    const [applicant] = await ponderClient.db.select({
      applicant: v4Applicants,
      program: {
        pid: v4Programs.pid,
        metadataCID: v4Programs.metadataCID,
        token: v4Programs.token,
        status: v4Programs.status,
      },
    })
      .from(v4Applicants)
      .leftJoin(v4Programs, eq(v4Applicants.pid, v4Programs.pid))
      .where(and(eq(v4Applicants.pid, pid), eq(v4Applicants.wallet, wallet)))
      .limit(1);

    return applicant ?? null;
  }
}
