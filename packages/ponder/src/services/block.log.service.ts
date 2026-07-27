import type { Context } from "ponder:registry";
import { indexedBlocks } from "ponder:schema";

type InsertBlockArgs = {
  db: Context["db"];
  eventName: string;
  event: {
    block: {
      number: bigint | number;
      timestamp: bigint | number;
    };
  };
};

export const insertBlock = async ({ db, eventName, event }: InsertBlockArgs) => {
  const blockNumber = Number(event.block.number);
  const timestamp = new Date(Number(event.block.timestamp) * 1000);

  await db.insert(indexedBlocks).values({
    blockNumber,
    eventName,
    timestamp,
  }).onConflictDoUpdate({
    eventName,
    timestamp,
  });
};
