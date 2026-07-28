import { db } from "ponder:api";
import * as schemaModule from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import { cors } from "hono/cors";

// The "ponder:schema" virtual module (via vite-node SSR interop) carries a
// synthetic `default` key pointing at a null-prototype object that isn't
// part of our actual schema. drizzle-orm's `is()` helper (used internally by
// Ponder's graphql()/client() to walk every schema export) doesn't handle
// null-prototype values defensively and throws
// "Cannot read properties of null (reading 'constructor')" if it's left in.
// Stripping it here avoids needing to patch the ponder package itself.
const { default: _moduleDefault, ...schema } = schemaModule as Record<string, unknown>;

const app = new Hono();

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], credentials: false }));
app.options("*", cors());

app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
export type AppType = typeof app;
