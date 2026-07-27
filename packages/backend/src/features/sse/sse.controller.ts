import type { Context } from "hono";
import type { SSEStreamingApi } from "hono/streaming";
import { Controller, Get, Post, Sse, ApiTags, ApiDoc, channels, SseChannelClient } from "hono-forge";

/**
 * Real-time push channel. Ponder no longer serves SSE itself (moved here per
 * the backend split) — its event handlers instead POST to /sse/broadcast,
 * which fans out to every connected browser client via hono-forge's channel
 * registry (in-memory by default, swappable for RedisChannelAdapter later
 * if this ever needs to scale beyond one backend instance).
 */
const CHANNEL = "main";

@Controller("/sse")
@ApiTags("SSE")
export class SseController {
  @Sse("/")
  @ApiDoc({ summary: "Subscribe to real-time protocol events" })
  async stream(c: Context, stream: SSEStreamingApi) {
    c.header("Access-Control-Allow-Origin", "*");

    const clientId = crypto.randomUUID();
    const client = new SseChannelClient(clientId, stream);
    await channels.subscribe(CHANNEL, client);

    await stream.writeSSE({ event: "init", data: "connected" });

    const heartbeat = setInterval(() => {
      void stream.writeSSE({ data: "💓" });
    }, 15000);

    c.req.raw.signal?.addEventListener("abort", () => {
      clearInterval(heartbeat);
      void channels.unsubscribe(CHANNEL, clientId);
    });

    await new Promise(() => { /* keep the connection open until abort */ });
  }

  @Get("/min")
  @ApiDoc({ summary: "Minimal SSE heartbeat endpoint (no channel subscription)" })
  min(c: Context) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`retry: 10000\n\n`));
        const interval = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(`event: ping\ndata: ${Date.now()}\n\n`));
        }, 3000);

        c.executionCtx.waitUntil(
          new Promise((resolve) => {
            stream.cancel = () => {
              clearInterval(interval);
              resolve(undefined);
              return Promise.resolve();
            };
          })
        );
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }

  @Post("/broadcast")
  @ApiDoc({ summary: "Internal: push an event to every connected SSE client (used by Ponder's event handlers, not the public frontend)" })
  async broadcast(c: Context) {
    const { channel, data } = await c.req.json();
    await channels.publish(channel ?? CHANNEL, channel ?? CHANNEL, data);
    return c.json({ ok: true });
  }
}
