import { ponder } from "ponder:registry";
import { v4TokenRegistry } from "ponder:schema";
import { logger } from "@/utils/logger";
import { insertBlock } from "@/services/block.log.service";
import { sendSseToAll } from "@/services/sse.notify.service";

/**
 * ScholarshipPriceOracle — mirrors the on-chain token registry and USD rates
 * into `v4_token_registry` so the backend can serve them over REST.
 *
 * Rates here are DISPLAY-ONLY (see ScholarshipPriceOracle.sol) — nothing that
 * moves funds reads them.
 */
export const scholarshipPriceOracleHandlers = () => {

  ponder.on("ScholarshipPriceOracle:TokenRegistered", async ({ event, context }) => {
    try {
      const { db } = context;
      const { token, symbol, decimals } = event.args;
      const addr = String(token).toLowerCase();

      await db.insert(v4TokenRegistry).values({
        token: addr,
        symbol: String(symbol),
        decimals: Number(decimals),
        isRegistered: true,
      }).onConflictDoUpdate({
        // Re-registering after a deregister revives the row rather than
        // creating a duplicate, and refreshes symbol/decimals.
        symbol: String(symbol),
        decimals: Number(decimals),
        isRegistered: true,
        updatedAt: new Date(),
      });

      await insertBlock({ db, event, eventName: "ScholarshipPriceOracle:TokenRegistered" });
      await sendSseToAll("main", {
        step: "TokenRegistered",
        data: { token: addr, symbol: String(symbol), decimals: Number(decimals) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "TokenRegistered handler error");
    }
  });

  ponder.on("ScholarshipPriceOracle:TokenDeregistered", async ({ event, context }) => {
    try {
      const { db } = context;
      const { token } = event.args;
      const addr = String(token).toLowerCase();

      // Soft-delete: keep symbol/decimals so historical amounts still render
      // with the right denomination.
      await db.update(v4TokenRegistry, { token: addr })
        .set({ isRegistered: false, updatedAt: new Date() });

      await insertBlock({ db, event, eventName: "ScholarshipPriceOracle:TokenDeregistered" });
      await sendSseToAll("main", {
        step: "TokenDeregistered",
        data: { token: addr },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "TokenDeregistered handler error");
    }
  });

  ponder.on("ScholarshipPriceOracle:PriceUpdated", async ({ event, context }) => {
    try {
      const { db } = context;
      const { token, priceUsd, updatedAt } = event.args;
      const addr = String(token).toLowerCase();
      const priceAt = new Date(Number(updatedAt) * 1000);

      // Insert-or-update: the contract rejects prices for unregistered tokens,
      // but if TokenRegistered were ever missed (reorg, partial backfill) this
      // still records the rate rather than silently dropping it.
      await db.insert(v4TokenRegistry).values({
        token: addr,
        priceUsd: String(priceUsd),
        priceUpdatedAt: priceAt,
        isRegistered: true,
      }).onConflictDoUpdate({
        priceUsd: String(priceUsd),
        priceUpdatedAt: priceAt,
        updatedAt: new Date(),
      });

      await insertBlock({ db, event, eventName: "ScholarshipPriceOracle:PriceUpdated" });
      await sendSseToAll("main", {
        step: "PriceUpdated",
        data: { token: addr, priceUsd: String(priceUsd) },
        status: true, blockHash: event.block.hash,
      });
    } catch (err) {
      logger.error({ err }, "PriceUpdated handler error");
    }
  });
};
