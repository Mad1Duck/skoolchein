import "reflect-metadata";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { HonoRouteBuilder, OpenAPIGenerator, HttpException } from "hono-forge";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import { chainMiddleware } from "@/config/chain-context";
import {
  HealthController,
  IpfsController,
  SseController,
  WebhooksController,
  LearningController,
  ProgramsController,
  ApplicantsController,
  ScholarsController,
  MilestonesController,
  VotesController,
  DisputesController,
  ReputationController,
  DashboardController,
  AdminController,
  TokensController,
} from "@/features";

HonoRouteBuilder.configure({
  requestLogger: (e) => logger.info({ method: e.method, path: e.path, status: e.statusCode, durationMs: e.durationMs }, "request"),
  onError: (err, c) => {
    // Returning a Response here short-circuits hono-forge's own error
    // handling, so let HttpException fall through — otherwise every
    // deliberate 404/400 would be rewritten into a 500.
    if (err instanceof HttpException) return;
    logger.error({ err }, "unhandled error");
    return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: (err as Error).message } }, 500);
  },
});

const app = new Hono();
app.use(honoLogger());
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], credentials: false }));
app.options("*", cors());

// Chain-scope every Ponder-backed route. /v4/learning is backend-owned data
// (HackQuest/Udemy progress) and is not per-chain.
app.use("/v4/*", async (c, next) => (c.req.path.startsWith("/v4/learning") ? next() : chainMiddleware(c, next)));

const controllers = [
  HealthController, IpfsController, SseController, WebhooksController, LearningController,
  ProgramsController, ApplicantsController, ScholarsController, MilestonesController,
  VotesController, DisputesController, ReputationController, DashboardController,
  AdminController, TokensController,
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
