import type { Context } from "hono";
import os from "os";
import checkDiskSpace from "check-disk-space";
import { sql } from "drizzle-orm";
import { Controller, Get, Injectable, Public, ApiTags, ApiDoc, channels } from "hono-forge";
import { db } from "@/config/db";
import { logger } from "@/utils/logger";
import { GeminiService } from "@/features/gemini/gemini.service";

@Controller("/health")
@Injectable([GeminiService])
@ApiTags("Health")
export class HealthController {
  constructor(private gemini: GeminiService) {}

  /**
   * Container healthcheck target (docker-compose `test: wget .../health`).
   *
   * Must stay fast and free of third-party dependencies — the healthcheck
   * runs with a 5s timeout, and `depends_on: condition: service_healthy`
   * gates the whole deploy on it. Anything slow or external (Gemini, disk,
   * SSE fan-out) belongs in /health/detail instead.
   *
   * Always 200 while the process is alive: backend serves most /v4/* routes
   * through Ponder over HTTP, so its own Postgres being down degrades only
   * the learning/webhook routes rather than making the service unusable.
   * DB state is reported in the body for observability.
   */
  @Get("/")
  @Public()
  @ApiDoc({ summary: "Liveness probe — fast, no external dependencies" })
  async check(c: Context) {
    let database = "connected";
    try {
      await db.execute(sql`SELECT 1`);
    } catch (e) {
      logger.error({ e }, "database error");
      database = "error";
    }

    // NOTE: return a plain object, never `c.json(...)`. hono-forge's route
    // builder unconditionally does `c.json(result)` on whatever the handler
    // returns, so returning a Response gets double-wrapped into `{}`.
    return {
      status: "ok",
      database,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Full diagnostics — CPU, memory, disk, DB, plus a Gemini summary.
   * Deliberately NOT the healthcheck target (see above).
   */
  @Get("/detail")
  @Public()
  @ApiDoc({ summary: "Full diagnostics (CPU, memory, disk, DB, Gemini analysis)" })
  async detail(c: Context) {
    const cpuLoad = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    let disk: unknown;
    try {
      disk = await checkDiskSpace("/");
    } catch (e) {
      disk = { error: "Failed to read disk info" };
    }

    let dbStatus = "unknown";
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "connected";
    } catch (e) {
      logger.error({ e }, "database error");
      dbStatus = "error";
    }

    const snapshot = {
      cpuLoadAvg: {
        "1min": cpuLoad[0],
        "5min": cpuLoad[1],
        "15min": cpuLoad[2],
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usedPercent: +(usedMem / totalMem * 100).toFixed(2),
      },
      disk,
      database: dbStatus,
      status: "ok",
    };

    await channels.publish("main", "main", { step: "Health", data: snapshot, status: true });

    const geminiResponse = await this.gemini.summarize(JSON.stringify(snapshot));

    return { ...snapshot, geminiResponse };
  }
}
