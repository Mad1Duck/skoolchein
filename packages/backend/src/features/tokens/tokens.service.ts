import { Injectable, Singleton } from "hono-forge";
import { eq, asc } from "@ponder/client";
import { ponderClient, ponderSchema } from "@/config/ponder-client";
import { onChain } from "@/config/chain-context";

const { v4TokenRegistry } = ponderSchema;

@Injectable()
@Singleton()
export class TokensService {
  /**
   * Payment tokens and their USD rates, mirrored from ScholarshipPriceOracle.
   *
   * NOTE: priceUsd carries 8 decimals (Chainlink convention) and is
   * DISPLAY-ONLY — no fund-moving contract reads it. Never derive a transfer
   * amount from this value.
   */
  async list(opts: { includeDeregistered: boolean }) {
    const rows = await ponderClient.db
      .select()
      .from(v4TokenRegistry)
      .where(onChain(v4TokenRegistry, opts.includeDeregistered ? undefined : eq(v4TokenRegistry.isRegistered, true)))
      .orderBy(asc(v4TokenRegistry.symbol));

    return rows;
  }

  async getByAddress(token: string) {
    const [row] = await ponderClient.db
      .select()
      .from(v4TokenRegistry)
      .where(onChain(v4TokenRegistry, eq(v4TokenRegistry.token, token.toLowerCase())))
      .limit(1);

    return row ?? null;
  }
}
