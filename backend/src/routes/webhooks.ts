import axios from "axios";
import crypto from "crypto";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { db } from "../db/index.js";
import { ALL_WEBHOOK_EVENTS } from "../webhooks/events.js";
import { isPrivateUrl, signPayload } from "../webhooks/dispatcher.js";
import { config } from "../config.js";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

router.get("/", async (req: Request, res: Response) => {
  const instance = req.instance!;
  res.json({
    url: instance.webhook_url ?? null,
    events: instance.webhook_events ?? [],
    hasSecret: !!instance.webhook_secret,
  });
});

router.put("/", async (req: Request, res: Response) => {
  const body = z.object({
    url: z.string().url().nullable().optional(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]])).optional(),
    secret: z.string().min(8).max(64).optional(),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ error: "Validation error", details: body.error.errors });
  }

  const { url, events, secret } = body.data;
  const update: Record<string, unknown> = {};
  if (url !== undefined) update.webhook_url = url;
  if (events !== undefined) update.webhook_events = JSON.stringify(events);
  if (secret !== undefined) update.webhook_secret = secret;

  await db("instances").where({ id: req.params.instanceId }).update(update);

  const updated = await db("instances").where({ id: req.params.instanceId }).first();
  res.json({
    url: updated.webhook_url ?? null,
    events: updated.webhook_events ?? [],
    hasSecret: !!updated.webhook_secret,
  });
});

router.get("/logs", async (req: Request, res: Response) => {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const logs = await db("webhook_logs")
    .where({ instance_id: req.params.instanceId })
    .where("created_at", ">=", since)
    .orderBy("created_at", "desc")
    .limit(200)
    .select("id", "event", "url", "status_code", "duration_ms", "error", "created_at");

  res.json(logs);
});

router.post("/test", async (req: Request, res: Response) => {
  const instance = req.instance!;
  const url = instance.webhook_url as string | null;

  if (!url) {
    return res.status(400).json({ error: "No webhook URL configured" });
  }
  if (isPrivateUrl(url)) {
    return res.status(400).json({ error: "Webhook URL targets a private address" });
  }

  const payload = {
    instanceId: req.params.instanceId,
    userId: req.userId,
    event: "test",
    timestamp: Math.floor(Date.now() / 1000),
    data: { message: "This is a test delivery from Botsab" },
  };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (instance.webhook_secret) {
    headers["X-Webhook-Signature"] = signPayload(body, instance.webhook_secret as string);
  }

  const t0 = Date.now();
  try {
    const resp = await axios.post(url, payload, { timeout: config.webhookTimeoutMs, headers });
    const duration = Date.now() - t0;

    await db("webhook_logs").insert({
      instance_id: req.params.instanceId,
      event: "test",
      url,
      status_code: resp.status,
      duration_ms: duration,
      error: null,
    });

    res.json({ success: true, statusCode: resp.status, durationMs: duration });
  } catch (err) {
    const duration = Date.now() - t0;
    const statusCode = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
    const error = err instanceof Error ? err.message : "Unknown error";

    await db("webhook_logs").insert({
      instance_id: req.params.instanceId,
      event: "test",
      url,
      status_code: statusCode,
      duration_ms: duration,
      error,
    });

    res.json({ success: false, statusCode, durationMs: duration, error });
  }
});

// Remove signing secret without changing other settings
router.delete("/secret", async (req: Request, res: Response) => {
  await db("instances").where({ id: req.params.instanceId }).update({ webhook_secret: null });
  res.json({ ok: true });
});

export default router;
