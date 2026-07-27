import type { Context } from "ponder:registry";
import { v4Reputation, v4BountyHunters } from "ponder:schema";

/** Upsert v4_reputation balance for an address */
export async function upsertReputation(
  db: Context["db"],
  address: string,
  delta: bigint,
  isMint: boolean,
) {
  const existing = await db.find(v4Reputation, { address });

  if (!existing) {
    await db.insert(v4Reputation).values({
      address,
      repBalance: String(isMint ? delta : 0n),
      totalMinted: String(isMint ? delta : 0n),
      totalBurned: String(isMint ? 0n : delta),
    });
  } else {
    const prev = BigInt(existing.repBalance ?? "0");
    await db.update(v4Reputation, { address }).set({
      repBalance: String(isMint ? prev + delta : (prev > delta ? prev - delta : 0n)),
      totalMinted: String(BigInt(existing.totalMinted ?? "0") + (isMint ? delta : 0n)),
      totalBurned: String(BigInt(existing.totalBurned ?? "0") + (isMint ? 0n : delta)),
      updatedAt: new Date(),
    });
  }
}

/** Upsert bounty hunter profile */
export async function upsertBountyHunter(db: Context["db"], address: string) {
  const existing = await db.find(v4BountyHunters, { address });

  if (!existing) {
    await db.insert(v4BountyHunters).values({ address, totalDisputes: 1 });
  } else {
    await db.update(v4BountyHunters, { address }).set({
      totalDisputes: (existing.totalDisputes ?? 0) + 1,
      updatedAt: new Date(),
    });
  }
}

/** Convert bigint timestamp to Date */
export const toDate = (ts: bigint) => ts > 0n ? new Date(Number(ts) * 1000) : null;
