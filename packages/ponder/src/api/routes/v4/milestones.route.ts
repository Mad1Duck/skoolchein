import { Hono } from "hono";
import { db } from "@/db";
import { v4Milestones, v4Programs, v4Scholars } from "@/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";

export const milestonesRoute = new Hono();

/**
 * GET / — List milestones
 * Query params:
 *   ?scholar=0x...     → filter by scholar wallet
 *   ?status=SUBMITTED  → filter by status
 *   ?limit=50          → pagination limit
 *   ?offset=0          → pagination offset
 */
milestonesRoute.get("/", async (c) => {
  try {
    const scholar = c.req.query("scholar");
    const status = c.req.query("status");
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
    const offset = Number(c.req.query("offset") ?? 0);

    const conditions = [];
    if (scholar) conditions.push(eq(v4Milestones.scholarWallet, scholar));
    if (status) conditions.push(eq(v4Milestones.status, status as NonNullable<typeof v4Milestones.$inferInsert["status"]>));

    const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

    const milestones = await db.select({
      milestone: v4Milestones,
      scholar: {
        id: v4Scholars.id,
        wallet: v4Scholars.wallet,
        status: v4Scholars.status,
        totalReceived: v4Scholars.totalReceived,
      },
      program: {
        pid: v4Programs.pid,
      },
    })
      .from(v4Milestones)
      .leftJoin(v4Scholars, eq(v4Milestones.scholarId, v4Scholars.id))
      .leftJoin(v4Programs, eq(v4Milestones.programId, v4Programs.id))
      .where(where)
      .orderBy(asc(v4Milestones.blockchainId))
      .limit(limit)
      .offset(offset);

    return c.json({ data: milestones });
  } catch (err) {
    return c.json({ error: "Failed to fetch milestones", details: String(err) }, 500);
  }
});

/**
 * GET /:id — Single milestone by UUID or blockchainId
 */
milestonesRoute.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    let results = await db.select().from(v4Milestones)
      .where(eq(v4Milestones.id, id)).limit(1);

    if (results.length === 0) {
      const numId = Number(id);
      if (!isNaN(numId)) {
        results = await db.select().from(v4Milestones)
          .where(eq(v4Milestones.blockchainId, numId)).limit(1);
      }
    }

    if (results.length === 0) {
      return c.json({ error: "Milestone not found" }, 404);
    }

    return c.json({ data: results[0] });
  } catch (err) {
    return c.json({ error: "Failed to fetch milestone", details: String(err) }, 500);
  }
});
