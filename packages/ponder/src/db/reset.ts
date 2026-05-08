import { sql } from 'drizzle-orm';
import { db } from '.';

export async function resetDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE
      indexed_blocks,
      v4_programs,
      v4_applicants,
      v4_scholars,
      v4_milestones,
      v4_votes,
      v4_confidence_stakes,
      v4_disputes,
      v4_reputation,
      v4_donations,
      v4_committee_members,
      v4_committee_dispute_votes,
      v4_committee_milestone_votes,
      v4_bounty_hunters
    RESTART IDENTITY CASCADE;
  `);
}

await resetDatabase();