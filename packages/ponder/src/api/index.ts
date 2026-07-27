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
