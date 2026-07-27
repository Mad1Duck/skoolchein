import "reflect-metadata";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { HonoRouteBuilder, OpenAPIGenerator } from "hono-forge";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
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
} from "@/features";

HonoRouteBuilder.configure({
  requestLogger: (e) => logger.info({ method: e.method, path: e.path, status: e.statusCode, durationMs: e.durationMs }, "request"),
  onError: (err, c) => {
    logger.error({ err }, "unhandled error");
    return c.json({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: (err as Error).message } }, 500);
  },
});

const app = new Hono();
app.use(honoLogger());
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"], credentials: false }));
app.options("*", cors());

const controllers = [
  HealthController, IpfsController, SseController, WebhooksController, LearningController,
  ProgramsController, ApplicantsController, ScholarsController, MilestonesController,
  VotesController, DisputesController, ReputationController, DashboardController,
  AdminController,
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
