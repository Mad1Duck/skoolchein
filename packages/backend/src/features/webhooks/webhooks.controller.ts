import type { Context } from "hono";
import { Controller, Post, Injectable, Public, ApiTags, ApiDoc, channels, HttpException } from "hono-forge";
import { env } from "@/config/env";
import { WebhooksService } from "./webhooks.service";

@Controller("/webhooks")
@Injectable([WebhooksService])
@ApiTags("Webhooks")
export class WebhooksController {
  constructor(private service: WebhooksService) {}

  /**
   * Endpoint for 3rd party learning platforms (HackQuest/Udemy)
   * POST /webhooks/progress
   * Body: { address, provider, courseId, progress, status, secret }
   */
  @Post("/progress")
  @Public()
  @ApiDoc({ summary: "Upsert external course progress (HackQuest/Udemy webhook)" })
  async progress(c: Context) {
    const body = await c.req.json();
    const { address, provider, courseId, progress, status, secret } = body;

    if (secret !== env.WEBHOOK_SECRET) {
      throw HttpException.unauthorized("Invalid webhook secret");
    }

    if (!address || !provider || !courseId) {
      throw HttpException.badRequest("Missing required fields: address, provider, courseId");
    }

    await this.service.upsertProgress({ address, provider, courseId, progress, status });

    await channels.publish("main", "main", {
      step: "ExternalProgressUpdated",
      data: { address: String(address).toLowerCase(), courseId },
      status: true,
    });

    return { success: true, message: "Progress updated" };
  }
}
