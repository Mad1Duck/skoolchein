import { Injectable, Singleton } from "hono-forge";
import { eq, and, desc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";

const { v4Votes, v4ConfidenceStakes } = ponderSchema;

@Injectable()
@Singleton()
export class VotesService {
  async list(opts: { voter?: string; candidate?: string; limit: number; offset: number }) {
    const conditions = [];
    if (opts.voter) conditions.push(eq(v4Votes.voterAddress, opts.voter));
    if (opts.candidate) conditions.push(eq(v4Votes.candidateAddress, opts.candidate));
    const where = conditions.length ? and(...conditions) : undefined;

    return ponderClient.db.select().from(v4Votes)
      .where(where)
      .orderBy(desc(v4Votes.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }

  async listStakes(opts: { voter?: string; resolved?: boolean; limit: number; offset: number }) {
    const conditions = [];
    if (opts.voter) conditions.push(eq(v4ConfidenceStakes.voterAddress, opts.voter));
    if (opts.resolved !== undefined) conditions.push(eq(v4ConfidenceStakes.isResolved, opts.resolved));
    const where = conditions.length ? and(...conditions) : undefined;

    return ponderClient.db.select().from(v4ConfidenceStakes)
      .where(where)
      .orderBy(desc(v4ConfidenceStakes.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);
  }
}
