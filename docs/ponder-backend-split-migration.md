# Migration Plan: Split Ponder REST API into `packages/backend`

## Why

`packages/ponder` currently does two jobs at once:

1. **Indexing** — listens to chain events, writes rows via Drizzle (its actual job).
2. **Serving a full REST API** — `/v4/*`, `/ipfs/*`, `/webhooks/*`, `/sse/*`, health checks, Gemini AI calls — none of which need to live inside the indexer process.

Reference architecture: `D:\Porto\madduck\phantom-bounty\phantom\packages\backend` already separates this into two services:

- `backend/indexer` → Ponder only (chain sync, GraphQL/SQL endpoints).
- `backend/backend-main` → Hono REST API, its own Drizzle connection, business logic.

Skoolcein's `packages/backend` already exists as an empty Hono skeleton (`@d:\Porto\@team-kunyuk\scholarship\packages\backend\src\index.ts`) — it's the intended target, just unused so far.

**Goal:** `packages/ponder` keeps ONLY indexing handlers + Ponder's built-in `graphql()` / `client()` (SQL-over-HTTP) middleware. Everything else (REST routes, controllers, services, uploads, webhooks, SSE, health) moves to `packages/backend`.

## Root Cause Fix: Schema Ownership (this is the real fix for the migration conflict)

This is the piece that actually eliminates the recurring `syntax error at or near ')'` / crash-recovery bug for good, not just a symptom workaround.

**The problem:** `packages/ponder/src/db/schema.ts` (`@d:\Porto\@team-kunyuk\scholarship\packages\ponder\src\db\schema.ts`) defines all indexed tables (`v4_programs`, `v4_applicants`, etc.) as plain `pgTable(...)` from `drizzle-orm/pg-core`, and `packages/ponder/ponder.schema.ts` is left empty. This means:

- Ponder's own internal migration/crash-recovery engine only manages its **own bookkeeping tables** in the `skoolcein` schema (build id, reorg logs) — it has no idea about `v4_programs` etc.
- The actual application tables live in `public`, managed entirely by hand-rolled `drizzle-kit` migrations, which Ponder's indexing handlers write into using a raw `pg` `Pool` + `drizzle()` client (`@d:\Porto\@team-kunyuk\scholarship\packages\ponder\src\db\index.ts`).
- Ponder was never designed to be used this way — its crash-recovery/revert logic assumes it owns the tables it manages via `ponder.schema.ts` + `onchainTable`. Bolting on an external Drizzle schema it doesn't know about is what left it in an inconsistent internal state after crashes.

**The fix:** Move indexed table definitions from `packages/ponder/src/db/schema.ts` (Drizzle `pgTable`) into `packages/ponder/ponder.schema.ts` using Ponder's own `onchainTable` API. Ponder then fully owns migration and crash recovery for these tables — no `drizzle-kit generate/migrate/push` needed for them at all.

### Before (current, wrong)

```ts
// packages/ponder/src/db/schema.ts
import { pgTable, integer, varchar, ... } from "drizzle-orm/pg-core";

export const v4Programs = pgTable("v4_programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pid: integer("pid").notNull().unique(),
  initiator: varchar("initiator", { length: 42 }).notNull(),
  // ...
});
```

```ts
// packages/ponder/src/handlers/v4/core.ts
import { db } from "@/db"; // raw pg Pool + drizzle()
await db.insert(v4Programs).values({ ... }).onConflictDoUpdate({ ... });
```

### After (correct, Ponder-idiomatic)

```ts
// packages/ponder/ponder.schema.ts
import { onchainTable } from "ponder";

export const v4Programs = onchainTable("v4_programs", (t) => ({
  id: t.text().primaryKey(), // Ponder convention: string/bigint PK, not uuid default
  pid: t.integer().notNull(),
  initiator: t.text().notNull(),
  metadataCid: t.text().default(""),
  status: t.text().default("CREATED"),
  // ... rest of columns, same shape
}));
```

```ts
// packages/ponder/src/handlers/v4/core.ts
import { ponder } from "ponder:registry";
import { v4Programs } from "ponder:schema";

ponder.on("ScholarshipCore:ProgramCreated", async ({ event, context }) => {
  await context.db.insert(v4Programs).values({ ... }).onConflictDoUpdate({ ... });
});
```

Key API differences to handle during conversion:

- `context.db` (available inside every event handler via the second argument) replaces the manually-created `db` from `@/db`. Insert/update/`onConflictDoUpdate` syntax is nearly identical.
- Primary keys in `onchainTable` are typically the natural on-chain id (e.g. `pid`, or a composite `tx_hash:log_index`) rather than `uuid().defaultRandom()` — Ponder doesn't auto-generate UUIDs server-side the same way.
- Enums: Ponder's `onchainTable` doesn't have a direct `pgEnum` equivalent exposed the same way; use `t.text()` with a TypeScript union type for validation at the application layer, or keep enums as actual Postgres enums defined via `onchainEnum` (Ponder does expose `onchainEnum` — see `@d:\Porto\@team-kunyuk\scholarship\packages\ponder\drizzle\0000_third_bromley.sql` for the current enum list to port over).
- Relations (`relations()` from `drizzle-orm`) are supported by Ponder's schema too — same import, works with `onchainTable`.
- `db/reset.ts` (`@d:\Porto\@team-kunyuk\scholarship\packages\ponder\src\db\reset.ts`) truncate logic can be replaced by simply dropping the `skoolcein` schema and letting Ponder rebuild it (`ponder start` recreates tables automatically when the build id changes).

### What this means for `packages/backend`

Backend should **not** duplicate `v4Programs`/`v4Applicants`/etc. as its own Drizzle schema. Instead:

- **Backend owns `drizzle-kit` exclusively for its own off-chain tables** — things Ponder doesn't index from chain events, e.g. `course_completions`, `course_credentials`, admin/config tables, cached aggregates. These live in `public` schema, managed by `packages/backend/drizzle.config.ts` + real migration files.
- **Backend reads indexed on-chain data via `@ponder/client`**, Ponder's official SQL-over-HTTP client, instead of connecting directly to Postgres for those tables:

```ts
// packages/backend/src/lib/ponder-client.ts
import { createClient } from "@ponder/client";
import * as ponderSchema from "../../../ponder/ponder.schema";

export const ponderClient = createClient(
  process.env.PONDER_SQL_URL ?? "http://scholarship-ponder:42069/sql",
  { schema: ponderSchema }
);
```

```ts
// packages/backend/src/api/routes/v4/programs.route.ts
import { ponderClient } from "@/lib/ponder-client";
import { v4Programs } from "../../../../ponder/ponder.schema";
import { desc } from "@ponder/client";

programsRoute.get("/", async (c) => {
  const programs = await ponderClient.db
    .select()
    .from(v4Programs)
    .orderBy(desc(v4Programs.createdAt))
    .limit(20);
  return c.json({ data: programs });
});
```

This removes the second source of truth entirely: Ponder is the only writer and the only migration owner for indexed data; backend is purely a read-through REST layer over Ponder's SQL endpoint, plus the sole owner of its own genuinely separate off-chain tables.

**Net result:** two independent, non-overlapping migration domains — Ponder manages `skoolcein`-tracked onchain tables internally (no `drizzle-kit` involved at all), backend manages its own small `public`-schema tables via normal `drizzle-kit` migrations. The original conflict (`syntax error at or near ')'`, `type already exists`, concurrent migrate/push) cannot recur because there is no longer a Drizzle migration tool touching Ponder-owned tables.

---

## Table Ownership Matrix (verified by grep — every table accounted for)

This is the authoritative list of all **17 tables** currently in `@d:\Porto\@team-kunyuk\scholarship\packages\ponder\src\db\schema.ts`, cross-checked against every writer (`src/handlers/v4/*`) and every reader (`src/api/routes/v4/*`). Nothing here is guessed — each row was confirmed with a grep pass over the actual codebase.

| Table | Written by (handler file) | Read by (route file) | Final owner |
|---|---|---|---|
| `indexed_blocks` | `services/block.log.service.ts` (called from all handlers) | — (internal only) | **Ponder** (`onchainTable`) |
| `v4_programs` | `core.ts`, `treasury.ts`, `milestones.ts` | `programs.route.ts`, `dashboard.route.ts`, `admin.route.ts` | **Ponder** (`onchainTable`) |
| `v4_applicants` | `core.ts`, `governance.ts` | `applicants.route.ts`, `dashboard.route.ts`, `admin.route.ts` | **Ponder** (`onchainTable`) |
| `v4_scholars` | `core.ts`, `milestones.ts` | `scholars.route.ts`, `dashboard.route.ts`, `admin.route.ts` | **Ponder** (`onchainTable`) |
| `v4_milestones` | `milestones.ts` | `milestones.route.ts`, `dashboard.route.ts`, `admin.route.ts` | **Ponder** (`onchainTable`) |
| `v4_votes` | `core.ts` | `votes.route.ts`, `dashboard.route.ts` | **Ponder** (`onchainTable`) |
| `v4_confidence_stakes` | `core.ts`, `treasury.ts` | `dashboard.route.ts` | **Ponder** (`onchainTable`) |
| `v4_disputes` | `bounty.ts`, `core.ts` | `disputes.route.ts`, `dashboard.route.ts`, `admin.route.ts` | **Ponder** (`onchainTable`) |
| `v4_reputation` | `helpers.ts`, `treasury.ts`, `core.ts` | `reputation.route.ts`, `dashboard.route.ts` | **Ponder** (`onchainTable`) |
| `v4_treasury_withdrawals` | `treasury.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — expose via new backend route if needed, or leave GraphQL-only |
| `v4_fraud_nfts` | `core.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — same as above |
| `v4_donations` | `treasury.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — same as above |
| `v4_committee_members` | `governance.ts` | `dashboard.route.ts` (via join) | **Ponder** (`onchainTable`) |
| `v4_committee_dispute_votes` | `governance.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — same as above |
| `v4_committee_milestone_votes` | `governance.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — same as above |
| `v4_bounty_hunters` | `helpers.ts`, `treasury.ts` | ⚠️ **none** — no REST route exists for this table today | **Ponder** (`onchainTable`) — same as above |
| `v4_external_learning` | ❌ **no chain handler writes this** — only `v4_learning.controller.ts` (webhook) | `learning.route.ts` | **Backend** (own Drizzle schema, `public`) |

**Callouts from this audit:**

1. **6 tables have zero existing REST exposure** (`v4_treasury_withdrawals`, `v4_fraud_nfts`, `v4_donations`, `v4_committee_dispute_votes`, `v4_committee_milestone_votes`, `v4_bounty_hunters`) — they're currently only queryable via Ponder's auto-generated GraphQL/SQL endpoint. This is **not a migration regression** — it's the pre-existing state. Confirm with the team whether the frontend needs any of these exposed as REST before/after migration; if so, add the corresponding controller in `packages/backend/src/features/`.
2. **`v4_external_learning` is the only table that must NOT be converted to `onchainTable`** — it has zero chain-handler writers, confirmed by grep across all of `src/handlers/`. Converting it to Ponder's schema would recreate a smaller version of the same root-cause bug (a table with no on-chain source of truth living inside Ponder's self-managed schema). It belongs in backend's own Drizzle schema.
3. **`dashboard.route.ts`** does `leftJoin`/`innerJoin` across `v4Applicants`↔`v4Programs`, `v4Scholars`↔`v4Programs`, and `v4CommitteeMembers`↔`v4Programs`. `@ponder/client`'s `.db` is a real Drizzle query builder over HTTP, so `.leftJoin()`/`.innerJoin()` work identically — no rewrite needed beyond the schema import change (verify during actual implementation against the installed `@ponder/client` version's join support, since it wraps `drizzle-orm` and should support standard join syntax).

---

## Database Architecture & Sync — how the two "separate DBs" actually communicate

Answering directly: **today it is one physical PostgreSQL instance (`skoolcain_db`) with two schema namespaces** (`skoolcein` for Ponder, `public` for backend) — not two physical databases. After this migration, it becomes cleaner: Ponder fully owns and self-manages the `skoolcein` schema (all 16 onchain tables + its own internal bookkeeping), backend fully owns a small set of tables in `public` (just `v4_external_learning` + future off-chain tables like `course_completions`).

**If genuinely separate physical databases/instances are wanted later** (e.g. for stronger isolation, independent scaling, or separate backup policies), the architecture in this doc already supports it with **zero code changes** on the read path:

- `@ponder/client` talks to Ponder over **HTTP** (`POST /sql`), not a raw Postgres connection. It doesn't matter whether Ponder's Postgres lives on the same server, a different container, or a completely separate managed DB — `ponderClient` only needs a URL (`PONDER_SQL_URL`).
- Backend's own Drizzle connection (`DATABASE_URL` for `public`-schema tables) is already a separate connection string/config from Ponder's `DATABASE_URL` — they can point at different hosts today with no code change, only env var changes.

**Sync guarantees / data flow:**

```
Blockchain event
      │
      ▼
Ponder handler (context.db.insert/update)   ──▶  Ponder's own Postgres (skoolcein schema)
                                                          │
                                                          │ (Ponder's built-in HTTP SQL server)
                                                          ▼
Backend route handler ──▶ ponderClient.db.select(...) ──▶ reads LIVE indexed state, no caching/staleness
                                                          │
                                                          ▼
                                                    JSON response to frontend
```

- **No polling, no batch sync job needed.** Every backend read via `ponderClient` hits Ponder's `/sql` endpoint fresh — it reflects whatever Ponder has indexed up to that exact moment (including reorg-safe finalized state).
- **One-directional dependency**: backend depends on Ponder being up to serve `/v4/programs`, `/v4/applicants`, etc. If Ponder is down, those specific backend routes will fail. `@d:\Porto\@team-kunyuk\scholarship\docker-compose.yml` currently only has `scholarship-frontend` wait on `scholarship-ponder`'s healthcheck (`depends_on: condition: service_healthy`) — Step 6 below must add the **same pattern for `scholarship-backend`** so it doesn't start serving `/v4/*` traffic before Ponder is confirmed healthy.
- **Backend's own tables (`v4_external_learning`, future `course_completions`) have no dependency on Ponder** — they can be read/written even if Ponder is temporarily down. This is a resilience improvement over today's setup, where a single `db.ts` connection failure would break both concerns at once.
- **Verify DB connectivity for both services independently** after migration:
  ```bash
  # Ponder health (includes internal DB check)
  curl http://localhost:42069/health-server-indexer  # or wherever its healthcheck lives after Step 5
  # Backend health (includes its own DB check)
  curl http://localhost:3101/health
  # Backend → Ponder SQL bridge check
  curl -X POST http://localhost:42069/sql -H "Content-Type: application/json" -d '{"sql":"select 1"}'
  ```

---

## Current State (as of this doc)

### `packages/ponder/src` layout

```
src/
├── index.ts                  → registers event handlers (KEEP in ponder)
├── handlers/v4/               → chain event handlers (KEEP in ponder)
│   ├── core.ts, bounty.ts, governance.ts, milestones.ts, treasury.ts, helpers.ts, index.ts
├── services/
│   └── block.log.service.ts   → used by handlers (KEEP in ponder, convert to context.db)
├── db/
│   ├── index.ts                → ⚠️ RETIRE — raw pg Pool + drizzle() client no longer needed;
│   │                              Ponder provides `context.db` inside handlers instead.
│   ├── schema.ts                → ⚠️ CONVERT — move table defs into `ponder.schema.ts`
│   │                              using `onchainTable` (see Root Cause Fix section above).
│   │                              Do NOT copy this file into backend as-is.
│   └── reset.ts                 → RETIRE — drop `skoolcein` schema instead (see above).
├── api/                        → ⚠️ MOVE all of this to packages/backend
│   ├── index.ts                  → Hono app entry (mounts everything below)
│   ├── controller/
│   │   ├── health.controller.ts    → MOVE (uses os/disk/gemini, no chain dependency)
│   │   ├── sse.controller.ts       → MOVE (in-memory SSE broadcaster)
│   │   ├── upload.controller.ts    → MOVE (IPFS upload via Pinata)
│   │   └── v4_learning.controller.ts → MOVE (webhook progress upsert)
│   ├── routes/
│   │   ├── server.health.route.ts  → MOVE
│   │   ├── sse.route.ts            → MOVE
│   │   ├── upload.route.ts         → MOVE
│   │   ├── webhooks.route.ts       → MOVE
│   │   └── v4/                     → MOVE (all 10 route files: programs, applicants,
│   │                                  scholars, milestones, votes, disputes,
│   │                                  reputation, dashboard, admin, learning)
│   ├── service/
│   │   ├── gemini.service.ts       → MOVE
│   │   └── ipfs.service.ts         → MOVE
│   ├── middlewares/
│   │   └── zod.middleware.ts       → MOVE
│   └── types/                     → MOVE (shared API types)
└── utils/
    ├── abiConverter.ts             → ⚠️ DEAD CODE — grep confirms zero imports anywhere in
    │                                  src/ (not used by handlers, config, or api). Verify with
    │                                  a workspace-wide search before deleting; if truly unused,
    │                                  delete rather than move.
    ├── getClientIP.ts              → ⚠️ DEAD CODE — zero imports found in src/. If a route
    │                                  actually needs client IP later, re-add it directly in
    │                                  packages/backend instead of moving unused code.
    ├── ipfs.ts                     → ⚠️ DEAD CODE — exports `fetchFromIPFS`/`cleanCID`/
    │                                  `isValidCID`, but zero imports found in handlers/ or
    │                                  api/ (handlers only read `metadataCID`/`evidenceCID`
    │                                  strings from event args, they never fetch/validate CIDs).
    │                                  Do not move as-is; only port over if a real caller shows up.
    ├── lib/
    │   ├── ipfs.ts                   → MOVE (used by api/service/ipfs.service.ts — the real
    │   │                                Pinata/local-IPFS client used by uploadController)
    │   └── ImageTemplateReSVG.ts      → MOVE (used by upload/NFT image generation in api layer)
    ├── logger.ts                   → DUPLICATE — both processes need their own logger instance;
    │                                  copy the file, don't share it across packages.
    └── publicDirectory.ts          → MOVE (serves uploaded files via API)
```

> **Note:** `src/types/meta.ts` (`IPFSMetadata` type, only consumed by the dead `utils/ipfs.ts`) and `api/types/metadata.type.ts` (`IMetadata`, consumed by `ipfs.service.ts`) should be re-verified during the actual move — don't carry over unused types.

### What Ponder's `src/api/index.ts` currently exposes (all via port 42069)

```ts
app.use("/sql/*", client(...))       // Ponder built-in — KEEP
app.use("/", graphql(...))            // Ponder built-in — KEEP
app.use("/graphql", graphql(...))     // Ponder built-in — KEEP
app.route("/ipfs", ipfsRoute)         // MOVE
app.route("/health-server-indexer", serverHealthRoute) // MOVE (rename to /health)
app.route("/sse", sseRoute)           // MOVE
app.route("/webhooks", webhooksRoute) // MOVE
app.get("/trigger", ...)              // MOVE (debug endpoint)
app.route("/v4", v4Routes)            // MOVE
```

After migration (and after converting `src/db/schema.ts` → `ponder.schema.ts` per Step 2), `packages/ponder/src/api/index.ts` should shrink to just:

```ts
import { db } from "ponder:api";
import * as schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], credentials: false }));
app.options("*", cors());

app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
export type AppType = typeof app;
```

Note `db` now comes from Ponder's own `ponder:api` virtual module (backed by `onchainTable` schema) instead of the retired hand-rolled `@/db` Drizzle client — no more manual `ReadonlyDrizzle` cast needed.

---

## Migration Steps

### Step 1 — Bootstrap `packages/backend` dependencies

Update `@d:\Porto\@team-kunyuk\scholarship\packages\backend\package.json` to match what the moved code needs:

```json
{
  "name": "backend",
  "scripts": {
    "dev": "bun run --hot src/main.ts",
    "start": "bun run src/main.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@ponder/client": "^0.11.37",
    "check-disk-space": "^3.4.0",
    "dotenv": "^17.2.1",
    "drizzle-orm": "^0.33.0",
    "hono": "^4.12.32",
    "hono-forge": "^3.0.0",
    "lodash": "^4.17.21",
    "pg": "^8.12.0",
    "pinata": "^2.5.5",
    "pino": "^9.7.0",
    "pino-pretty": "^13.0.0",
    "zod": "^4.0.10"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/pg": "^8.12.0",
    "drizzle-kit": "^0.24.0",
    "typescript": "^5.3.2"
  }
}
```

### Step 2 — Convert Ponder's schema, give backend its own minimal Drizzle schema

Per the Root Cause Fix above, **do not** duplicate `v4Programs`/`v4Applicants`/etc. into backend. Instead:

1. **In `packages/ponder`**: move **16 of the 17** table definitions from `src/db/schema.ts` into `ponder.schema.ts` using `onchainTable`/`onchainEnum` — every table except `v4ExternalLearning` (see the full Table Ownership Matrix below for why). Convert every handler in `src/handlers/v4/*` to use `context.db` instead of importing `db` from `@/db`. Delete `src/db/index.ts`, `src/db/schema.ts`, `src/db/reset.ts`, `drizzle.config.ts`, and the `drizzle/` migration folder once conversion is verified — Ponder no longer needs `drizzle-kit` at all.
2. **In `packages/backend`**: create a *new*, small Drizzle schema (`packages/backend/src/db/schema.ts`) containing only genuinely off-chain tables backend owns directly — e.g. `course_completions`, `course_credentials` (see `@d:\Porto\@team-kunyuk\scholarship\docs\course-integration-udemy-hackquest.md`), and `v4_external_learning` (currently in Ponder's schema but written only by the webhook controller, not by any chain handler — this one moves to backend's own schema since it's off-chain data). Set up `packages/backend/drizzle.config.ts` fresh, run `drizzle-kit generate` for these new tables only.
3. Install `@ponder/client` in `packages/backend` to read indexed on-chain data (programs, applicants, scholars, votes, disputes, reputation, etc.) via Ponder's SQL-over-HTTP endpoint instead of direct Postgres access. See the `ponderClient` example in the Root Cause Fix section.

> **Result:** Ponder and backend never touch the same migration tool or the same tables. Ponder's `skoolcein`-tracked tables are 100% internally managed; backend's `public`-schema tables (a small, new set) are 100% Drizzle-managed. No overlap, no race condition possible.

### Step 3 — Restructure into hono-forge controllers/services (NestJS-style)

Per the USER's request, `packages/backend` should follow the same `hono-forge` decorator pattern already used in `D:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main` — `@Controller`/`@Injectable`/`HonoRouteBuilder.build()` — not plain `new Hono().route(...)` mounting. Reference files: `@d:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main\src\main.ts`, `@d:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main\src\features\health\HealthController.ts`, `@d:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main\src\features\bounty-sources\bounty-sources.controller.ts`, `@d:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main\src\features\bounty-sources\bounty-sources.service.ts`.

**Target folder layout for `packages/backend/src`:**

```
src/
├── main.ts                        → entrypoint (replaces plain index.ts), HonoRouteBuilder wiring
├── config/
│   ├── env.ts                       → typed env accessor (mirror phantom's config/env.ts)
│   ├── db.ts                        → backend's own small Drizzle client (off-chain tables only)
│   └── ponder-client.ts             → @ponder/client instance pointed at Ponder's /sql endpoint
├── features/
│   ├── index.ts                     → re-exports all controllers for main.ts + OpenAPI spec
│   ├── health/
│   │   └── HealthController.ts        → converted from health.controller.ts + server.health.route.ts
│   ├── ipfs/
│   │   ├── ipfs.controller.ts         → converted from upload.controller.ts + upload.route.ts
│   │   ├── ipfs.service.ts            → moved from api/service/ipfs.service.ts (business logic, no Hono)
│   │   └── ipfs.dto.ts                → zod schemas for upload body validation
│   ├── sse/
│   │   └── sse.controller.ts          → converted from sse.controller.ts + sse.route.ts, using @Sse
│   ├── webhooks/
│   │   ├── webhooks.controller.ts     → converted from v4_learning.controller.ts + webhooks.route.ts
│   │   └── webhooks.service.ts        → upsert logic against backend's own db (v4_external_learning)
│   ├── programs/
│   │   ├── programs.controller.ts     → converted from programs.route.ts
│   │   └── programs.service.ts        → reads via ponderClient (see Step 2 / Root Cause Fix)
│   ├── applicants/  scholars/  milestones/  votes/  disputes/  reputation/  dashboard/  admin/  learning/
│   │   └── (same controller+service split, one feature folder per current v4/*.route.ts file)
│   └── gemini/
│       └── gemini.service.ts          → moved from api/service/gemini.service.ts
└── utils/
    ├── lib/                          → moved from ponder/src/utils/lib (real IPFS/image helpers)
    ├── publicDirectory.ts
    └── logger.ts
```

Every `*.route.ts` + its corresponding `*.controller.ts` collapses into a **single** hono-forge `@Controller` class per feature. Business logic (DB queries, IPFS calls) moves into a sibling `*.service.ts` marked `@Injectable()`, injected into the controller via `@Injectable([XService])` + constructor param — this is the DI pattern hono-forge requires (see `BountySourcesController`/`BountySourcesService` reference above).

**Example conversion — `programs.route.ts` → `features/programs/`:**

```ts
// features/programs/programs.service.ts
import { Injectable, Singleton } from "hono-forge";
import { ponderClient } from "../../config/ponder-client";
import { v4Programs } from "../../../../ponder/ponder.schema";
import { eq, desc, asc, and } from "@ponder/client";

@Injectable()
@Singleton()
export class ProgramsService {
  async list(opts: { status?: string; initiator?: string; limit: number; offset: number; sort: "asc" | "desc" }) {
    const conditions = [];
    if (opts.status) conditions.push(eq(v4Programs.status, opts.status));
    if (opts.initiator) conditions.push(eq(v4Programs.initiator, opts.initiator));
    const sortFn = opts.sort === "asc" ? asc : desc;

    const programs = await ponderClient.db
      .select()
      .from(v4Programs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sortFn(v4Programs.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return programs;
  }
}
```

```ts
// features/programs/programs.controller.ts
import type { Context } from "hono";
import { Controller, Get, Injectable, ApiTags, ApiDoc } from "hono-forge";
import { ProgramsService } from "./programs.service";

@Controller("/v4/programs")
@Injectable([ProgramsService])
@ApiTags("Programs")
export class ProgramsController {
  constructor(private service: ProgramsService) {}

  @Get("/")
  @ApiDoc({ summary: "List programs", description: "Filter by status/initiator, paginated." })
  async list(c: Context) {
    const status = c.req.query("status");
    const initiator = c.req.query("initiator");
    const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
    const offset = Number(c.req.query("offset") ?? 0);
    const sort = c.req.query("sort") === "asc" ? "asc" : "desc";

    const data = await this.service.list({ status, initiator, limit, offset, sort });
    return c.json({ data, limit, offset });
  }
}
```

Repeat this split for every route file under `packages/ponder/src/api/routes/v4/*` (`applicants`, `scholars`, `milestones`, `votes`, `disputes`, `reputation`, `dashboard`, `admin`, `learning`) and the shared ones (`upload` → `ipfs`, `server.health.route` → `health`, `sse.route` → `sse`, `webhooks.route` → `webhooks`).

**SSE conversion note:** hono-forge has first-class `@Sse` decorator support (see the `hono-forge` README's SSE/Channels sections) which is a better fit than the manual `streamSSE` + in-memory `clients[]` array currently in `sse.controller.ts`. Recommend migrating to `channels.subscribe`/`channels.publish` (hono-forge's pub/sub) instead of hand-rolled broadcast, since it also gives Redis-backed multi-instance support for free if the app ever scales beyond one backend container.

**Files NOT ported as-is:** `api/middlewares/zod.middleware.ts` — hono-forge already provides `Body`/`ValidatedBody`/`Query`/`ValidatedQuery` context helpers with built-in Zod validation, so this custom middleware becomes redundant. Convert each route's manual `c.req.json()` + zod `.parseAsync()` calls to `await Body(c, schema)` where practical.

### Step 4 — Create `packages/backend/src/main.ts` (new entrypoint)

Mirror `@d:\Porto\madduck\phantom-bounty\phantom\packages\backend\backend-main\src\main.ts`:

```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { HonoRouteBuilder, OpenAPIGenerator } from "hono-forge";
import { env } from "./config/env";
import {
  HealthController,
  IpfsController,
  SseController,
  WebhooksController,
  ProgramsController,
  ApplicantsController,
  ScholarsController,
  MilestonesController,
  VotesController,
  DisputesController,
  ReputationController,
  DashboardController,
  AdminController,
  LearningController,
} from "./features";

HonoRouteBuilder.configure({
  requestLogger: (e) => console.log(`${e.method} ${e.path} ${e.statusCode} ${e.durationMs}ms`),
  onError: (err, c) => {
    console.error("[Error]", err);
    return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: (err as Error).message } }, 500);
  },
});

const app = new Hono();
app.use(logger());
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], credentials: false }));

const controllers = [
  HealthController, IpfsController, SseController, WebhooksController,
  ProgramsController, ApplicantsController, ScholarsController, MilestonesController,
  VotesController, DisputesController, ReputationController, DashboardController,
  AdminController, LearningController,
];

for (const ctrl of controllers) {
  app.route("/", HonoRouteBuilder.build(ctrl as any));
}

const spec = OpenAPIGenerator.generate(controllers as any[], {
  info: { title: "Skoolcein Backend API", version: "1.0.0" },
  servers: [{ url: `http://localhost:${env.PORT}` }],
});
OpenAPIGenerator.mount(app, spec);

app.notFound((c) => c.json({ success: false, message: "Not Found" }, 404));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
```

Bonus over the previous plain-Hono entrypoint: this gives Skoolcein a free `/docs` (Scalar UI) + `/openapi.json` spec, auto-generated from `@ApiDoc`/`@ApiResponse`/`@ApiTags` decorators on every controller — nice for frontend devs consuming the REST API.

### Step 5 — Trim `packages/ponder/src/api/index.ts`

Replace with the minimal version shown in the "Current State" section above. Delete the now-empty `api/controller`, `api/routes`, `api/service`, `api/middlewares` directories from `packages/ponder`.

Also remove now-unused deps from `packages/ponder/package.json`: `@google/generative-ai`, `check-disk-space`, `pinata`, `lodash` (verify handlers don't use lodash elsewhere before removing — `core.ts`/others may still need it; check before deleting), and `drizzle-kit`/`pg` once the `onchainTable` conversion (Step 2) is complete and `src/db/*` is deleted.

Simplify `@d:\Porto\@team-kunyuk\scholarship\packages\ponder\start.sh` back to just `exec bun --bun ponder start` — no `db:migrate`/`db:push` fallback needed anymore, since Ponder no longer has a Drizzle schema of its own to migrate.

### Step 6 — Docker / Compose changes

Add a new service in `@d:\Porto\@team-kunyuk\scholarship\docker-compose.yml` mirroring `scholarship-ponder`:

```yaml
  scholarship-backend:
    build:
      context: .
      dockerfile: packages/backend/Dockerfile
    container_name: scholarship-backend
    ports:
      - "127.0.0.1:3101:3001"
    env_file:
      - .env
    environment:
      PORT: 3001
      DATABASE_URL: ${DATABASE_URL}
      # Points @ponder/client at Ponder's SQL-over-HTTP endpoint (internal
      # docker network hostname, not localhost — see Database Architecture
      # & Sync section above).
      PONDER_SQL_URL: ${PONDER_SQL_URL:-http://scholarship-ponder:42069/sql}
      WEBHOOK_SECRET: ${WEBHOOK_SECRET}
      PINATA_JWT: ${PINATA_JWT}
      PINATA_GATEWAY: ${PINATA_GATEWAY}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      NODE_ENV: production
    networks:
      - nawasena-network
    depends_on:
      scholarship-ponder:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped
```

`depends_on: condition: service_healthy` guarantees `scholarship-backend` never starts accepting `/v4/*` traffic before `scholarship-ponder`'s healthcheck (`@d:\Porto\@team-kunyuk\scholarship\docker-compose.yml:38`) passes — this directly implements the "one-directional dependency" behavior described in the Database Architecture & Sync section.

Create `packages/backend/Dockerfile` (model it after `@d:\Porto\@team-kunyuk\scholarship\packages\ponder\Dockerfile`), including a `start.sh` that runs `drizzle-kit migrate`/`push --force` fallback before `bun run start` — reuse the same pattern as `@d:\Porto\@team-kunyuk\scholarship\packages\ponder\start.sh`.

Update `scholarship-frontend`'s `depends_on` and `VITE_BACKEND_HOST` to point at `scholarship-backend` instead of `scholarship-ponder` for all `/v4`, `/ipfs`, `/webhooks`, `/sse` calls. GraphQL/SQL queries (if any direct ones from frontend) stay pointed at `scholarship-ponder`.

### Step 7 — Frontend updates

Search the frontend for any hardcoded paths like `/v4/...`, `/ipfs/upload`, `/sse`, `/webhooks/progress` and confirm they use an env-configurable base URL (`VITE_BACKEND_HOST`). Since Ponder no longer serves these, all such calls must point to the new backend service/port (3101 in local dev per docker-compose, or a separate public subdomain in production, e.g. `api.skoolcein.nawasena-labs.com` vs `indexer.skoolcein.nawasena-labs.com`).

### Step 8 — Reverse proxy / Caddy

If using Caddy (per `.env.example` reference to `api.skoolcein.nawasena-labs.com`), add a route for the new backend port (3101) separate from the indexer's GraphQL endpoint (42069), e.g.:

```
api.skoolcein.nawasena-labs.com {
  reverse_proxy localhost:3101
}

indexer.skoolcein.nawasena-labs.com {
  reverse_proxy localhost:42069
}
```

---

## Post-Migration Checklist

- [ ] `packages/ponder/src/index.ts` still registers only event handlers.
- [ ] `packages/ponder/src/api/index.ts` only exposes `/`, `/graphql`, `/sql/*`.
- [ ] `packages/backend/src/main.ts` serves `/v4/*`, `/ipfs/*`, `/webhooks/*`, `/sse/*`, `/health` via `HonoRouteBuilder.build()`.
- [ ] Every moved route is a `hono-forge` `@Controller` class under `packages/backend/src/features/*`, with business logic in a sibling `@Injectable()` service — no leftover plain `Hono().route(...)` files from the old `api/routes` structure.
- [ ] `/docs` (OpenAPI/Scalar UI) is reachable on the backend service after `OpenAPIGenerator.mount(app, spec)`.
- [ ] `packages/ponder` has no `drizzle.config.ts`, `drizzle/` folder, or `drizzle-kit`/`pg` dependency left — it only uses `ponder.schema.ts` + `context.db`.
- [ ] `packages/backend`'s Drizzle schema only contains genuinely off-chain tables (not a copy of Ponder's indexed tables).
- [ ] `packages/backend` reads indexed data exclusively via `@ponder/client` pointed at Ponder's `/sql` endpoint.
- [ ] Only `packages/backend` runs `drizzle-kit` migrations in the deploy pipeline now — this eliminates the original migration-conflict bug at the root, since Ponder no longer has any Drizzle migration surface at all.
- [ ] All **16 onchain tables** from the Table Ownership Matrix exist in `ponder.schema.ts`; **`v4_external_learning` is NOT among them** — it lives only in `packages/backend`'s Drizzle schema.
- [ ] Decide and document whether the 6 tables with no existing REST route (`v4_treasury_withdrawals`, `v4_fraud_nfts`, `v4_donations`, `v4_committee_dispute_votes`, `v4_committee_milestone_votes`, `v4_bounty_hunters`) need a backend controller added, or stay GraphQL-only via Ponder.
- [ ] `dashboard.route.ts`'s joins (`v4Applicants`↔`v4Programs`, `v4Scholars`↔`v4Programs`, `v4CommitteeMembers`↔`v4Programs`) work correctly through `ponderClient.db` after conversion — test this endpoint specifically since it's the most complex query.
- [ ] `docker-compose.yml` has both `scholarship-ponder` and `scholarship-backend` services, with `scholarship-backend` declaring `depends_on: scholarship-ponder: condition: service_healthy`.
- [ ] `PONDER_SQL_URL` env var is set for `scholarship-backend` and resolves via the internal Docker network hostname (`http://scholarship-ponder:42069/sql`), not `localhost`.
- [ ] Frontend env vars point REST calls to backend, GraphQL/SQL calls to Ponder.
- [ ] `.github/workflows/deploy.yml` builds and migrates both services in the correct order (backend migrates DB first, then both containers start).
- [ ] Remove dead code/dependencies from `packages/ponder/package.json` after confirming nothing in `handlers/` still needs them.
- [ ] Update `docs/` and `.env.example` to document the new `PORT`/`WEBHOOK_SECRET`/`PINATA_*`/`GEMINI_API_KEY`/`PONDER_SQL_URL` ownership under `packages/backend`.
- [ ] Run the three `curl` sanity checks from the Database Architecture & Sync section (Ponder health, backend health, backend→Ponder SQL bridge) after every deploy.

---

## Open Question for the Team

`v4_learning.controller.ts` (webhook progress endpoint) calls `sendSseToAll`, which lives in the SSE controller. Since SSE clients connect to the backend port after migration, this works fine as long as the frontend's EventSource URL is updated to point at `scholarship-backend`, not `scholarship-ponder`. Confirm frontend SSE consumer location before cutting over.
