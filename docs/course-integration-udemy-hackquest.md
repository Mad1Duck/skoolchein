# Course Platform Integration: Udemy & HackQuest

This document describes how to integrate Skoolcein scholarship eligibility with external course platforms.

## TL;DR

- **HackQuest** is the easier target: it is crypto-native and exposes webhooks / SBT minting.
- **Udemy** has no public API to verify course completion for arbitrary users. Integration is only viable if you are the course instructor (Udemy Instructor API) or you ask users to submit proof-of-completion manually.
- Recommended architecture: **off-chain webhook + on-chain SBT double verification**.

---

## 1. Off-chain Webhook Flow (HackQuest → Backend)

Use this when HackQuest can call your backend when a user finishes a course.

### 1.1 Flow

```
User completes course on HackQuest
        |
        v
HackQuest sends signed webhook
        |
        v
Hono backend verifies signature
        |
        v
Store completion in course_completions table
        |
        v
Frontend / backend eligibility check before apply
```

### 1.2 Database Addition

Add to `packages/ponder/src/db/schema.ts` (also used by backend via shared package or copied schema):

```ts
export const courseCompletions = pgTable("course_completions", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet: varchar("wallet", { length: 42 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(), // "hackquest" | "udemy"
  courseId: varchar("course_id", { length: 255 }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  proofUrl: text("proof_url"),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
```

Then generate a new Drizzle migration:

```bash
cd packages/ponder
bun run db:generate
```

### 1.3 Hono Webhook Endpoint

Add to `packages/backend/src/index.ts` or a new route file:

```ts
import { Hono } from "hono";
import { createHmac } from "crypto";
import { db } from "./db"; // shared Drizzle client
import { courseCompletions } from "./schema";

const app = new Hono();

app.post("/webhooks/hackquest/course-complete", async (c) => {
  const payload = await c.req.json();
  const signature = c.req.header("x-hackquest-signature");

  // Verify webhook signature (replace secret with your actual value)
  const secret = process.env.HACKQUEST_WEBHOOK_SECRET;
  const expected = createHmac("sha256", secret!)
    .update(JSON.stringify(payload))
    .digest("hex");

  if (signature !== expected) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const wallet = String(payload.wallet).toLowerCase();

  await db.insert(courseCompletions).values({
    wallet,
    platform: "hackquest",
    courseId: payload.courseId,
    completedAt: new Date(payload.completedAt),
    proofUrl: payload.proofUrl,
    verified: true,
  }).onConflictDoUpdate({
    target: [courseCompletions.wallet, courseCompletions.courseId],
    set: { completedAt: new Date(payload.completedAt), verified: true },
  });

  return c.json({ ok: true });
});
```

### 1.4 Eligibility Check Endpoint

```ts
app.get("/eligibility/:wallet/:courseId", async (c) => {
  const wallet = c.req.param("wallet").toLowerCase();
  const courseId = c.req.param("courseId");

  const [record] = await db
    .select()
    .from(courseCompletions)
    .where(
      and(
        eq(courseCompletions.wallet, wallet),
        eq(courseCompletions.courseId, courseId),
        eq(courseCompletions.verified, true)
      )
    )
    .limit(1);

  return c.json({ eligible: !!record });
});
```

### 1.5 Frontend Usage

Before calling `apply` on the smart contract, the frontend calls the eligibility endpoint. If not eligible, redirect the user to the HackQuest course.

### 1.6 Udemy Webhook Limitation

Udemy does not offer a generic "course completed" webhook for external parties. Viable paths:

1. You are the instructor → use the **Udemy Instructor API** to poll completions.
2. Ask the user to upload a completion certificate PDF → manual/admin verification.
3. Use a third-party credential verification service (e.g., Credly, Accredible) if the course issues verifiable credentials.

---

## 2. On-chain SBT Verification

Use this when HackQuest (or another platform) mints a Soulbound Token or credential NFT on-chain.

### 2.1 Flow

```
User completes course on HackQuest
        |
        v
HackQuest mints CourseSBT to user wallet
        |
        v
Ponder indexes Transfer/Mint event
        |
        v
Backend / smart contract checks SBT balance
        |
        v
Allow scholarship application
```

### 2.2 Ponder Handler

Add a new handler file `packages/ponder/src/handlers/v4/credentials.ts`:

```ts
import { ponder } from "ponder:generated";
import { db } from "@/db";
import { courseCredentials } from "@/db/schema";

const courseSbtAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const;

ponder.on("CourseSBT:Transfer", async ({ event, context }) => {
  const to = String(event.args.to).toLowerCase();
  const tokenId = String(event.args.tokenId);

  // Map tokenId to courseId (courseId could be in tokenURI or metadata)
  const courseId = await getCourseIdFromToken(context.contracts.CourseSBT.address, tokenId);

  await db.insert(courseCredentials).values({
    wallet: to,
    platform: "hackquest",
    courseId,
    tokenId,
    contractAddress: String(context.contracts.CourseSBT.address).toLowerCase(),
  }).onConflictDoNothing();
});
```

### 2.3 Database Addition

```ts
export const courseCredentials = pgTable("course_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet: varchar("wallet", { length: 42 }).notNull(),
  platform: varchar("platform", { length: 32 }).notNull(),
  courseId: varchar("course_id", { length: 255 }).notNull(),
  tokenId: text("token_id"),
  contractAddress: varchar("contract_address", { length: 42 }),
  mintedAt: timestamp("minted_at", { withTimezone: true }).defaultNow(),
});
```

### 2.4 Smart Contract Integration

If you want on-chain verification inside `ScholarshipCore`, add an SBT check before `apply`:

```solidity
interface ICourseCredential {
    function balanceOf(address account, uint256 courseId) external view returns (uint256);
}

contract ScholarshipCore {
    ICourseCredential public credentialContract;

    function apply(uint256 pid, string memory metadataURI) external {
        require(
            credentialContract.balanceOf(msg.sender, requiredCourseId[pid]) > 0,
            "Missing course credential"
        );
        // ... existing apply logic
    }
}
```

This is the most trustless approach but requires:

- The course platform to mint on-chain credentials.
- The credential contract to be deployed and set in `ScholarshipCore`.
- Ponder or the frontend to know the `courseId` → `tokenId` mapping.

---

## 3. Recommended Hybrid Architecture

For Skoolcein, the most practical setup is:

1. **Primary: HackQuest webhook** → backend marks wallet as course-completed quickly.
2. **Fallback/audit: SBT verification** → Ponder indexes on-chain credentials; backend cross-checks both tables before allowing apply.
3. **Udemy**: only via manual/admin verification or if you control the course via Udemy Instructor API.

### 3.1 Scholarship Apply Flow

```
Frontend:
  1. Call GET /eligibility/{wallet}/{courseId}
  2. If eligible, call ScholarshipCore.apply() on-chain
  3. Ponder indexes Application event
  4. Backend marks applicant as pending committee vote
```

### 3.2 Env Variables to Add

```env
HACKQUEST_WEBHOOK_SECRET="..."
COURSE_SBT_CONTRACT_ADDRESS="0x..."
```

### 3.3 Security Checklist

- Always verify webhook signatures using a secret.
- Normalize wallet addresses to lowercase before storing/comparing.
- Use `onConflictDoUpdate` / `onConflictDoNothing` to handle duplicate webhooks or re-indexing.
- If verifying on-chain, make the credential contract address configurable per program (not hardcoded).
- Consider rate-limiting the webhook endpoint.

---

## 4. Next Steps

1. Decide which platform(s) are supported per scholarship program.
2. Add `course_completions` and/or `course_credentials` table to Drizzle schema.
3. Implement the webhook endpoint in `packages/backend`.
4. Add eligibility API and integrate it into the frontend before `apply`.
5. (Optional) Add SBT contract and Ponder handler for on-chain verification.
