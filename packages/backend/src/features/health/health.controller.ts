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

  @Get("/")
  @Public()
  @ApiDoc({ summary: "Backend health check (CPU, memory, disk, DB, Gemini status)" })
  async check(c: Context) {
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

    return c.json({ ...snapshot, geminiResponse });
  }
}
