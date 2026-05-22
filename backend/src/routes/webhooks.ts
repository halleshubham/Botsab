import { Router, Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { db } from "../db";
import { ALL_WEBHOOK_EVENTS } from "../webhooks/events";

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
  const { url, events, secret } = z.object({
    url: z.string().url().nullable().optional(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]])).optional(),
    secret: z.string().min(8).max(64).optional(),
  }).parse(req.body);

  const update: Record<string, unknown> = {};
  if (url !== undefined) update.webhook_url = url;
  if (events !== undefined) update.webhook_events = JSON.stringify(events);
  if (secret !== undefined) {
    update.webhook_secret = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 64);
  }

  await db("instances").where({ id: req.params.instanceId }).update(update);

  const updated = await db("instances").where({ id: req.params.instanceId }).first();
  res.json({
    url: updated.webhook_url ?? null,
    events: updated.webhook_events ?? [],
    hasSecret: !!updated.webhook_secret,
  });
});

export default router;
