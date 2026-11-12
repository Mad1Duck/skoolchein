import { Injectable, Singleton } from "hono-forge";
import { eq } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

const { v4Reputation } = ponderSchema;

@Injectable()
@Singleton()
export class ReputationService {
  async getByAddress(address: string) {
    const [rep] = await ponderClient.db.select().from(v4Reputation)
      .where(onChain(v4Reputation, eq(v4Reputation.address, address))).limit(1);
    return rep ?? null;
  }
}
