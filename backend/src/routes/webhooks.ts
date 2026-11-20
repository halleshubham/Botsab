import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { ALL_WEBHOOK_EVENTS } from "../webhooks/events.js";
import { signPayload } from "../webhooks/dispatcher.js";
import {
  createWebhook,
  deleteWebhook,
  getPrimaryWebhook,
  getWebhook,
  listLogs,
  listWebhooks,
  removeSecret,
  serialize,
  testWebhook,
  updateWebhook,
} from "../webhooks/store.js";

// ── /instances/:instanceId/webhooks - several webhooks per instance ─────────

export const webhooksRouter = Router({ mergeParams: true });
webhooksRouter.use(requireApiKey);
webhooksRouter.use(requireInstanceOwner);

webhooksRouter.get("/", async (req: Request, res: Response) => {
  res.json((await listWebhooks(req.params.instanceId)).map(serialize));
});

webhooksRouter.post("/", async (req: Request, res: Response) => {
  res.status(201).json(serialize(await createWebhook(req.params.instanceId, req.body ?? {})));
});

// Delivery log for all of the instance's webhooks (?webhookId= for one)
webhooksRouter.get("/logs", async (req: Request, res: Response) => {
  const { webhookId } = z.object({ webhookId: z.string().uuid().optional() }).parse(req.query);
  res.json(await listLogs(req.params.instanceId, webhookId));
});

webhooksRouter.get("/:webhookId", async (req: Request, res: Response) => {
  res.json(serialize(await getWebhook(req.params.instanceId, req.params.webhookId)));
});

webhooksRouter.patch("/:webhookId", async (req: Request, res: Response) => {
  res.json(serialize(await updateWebhook(req.params.instanceId, req.params.webhookId, req.body ?? {})));
});

webhooksRouter.delete("/:webhookId", async (req: Request, res: Response) => {
  await deleteWebhook(req.params.instanceId, req.params.webhookId);
  res.json({ ok: true });
});

webhooksRouter.post("/:webhookId/test", async (req: Request, res: Response) => {
  const w = await getWebhook(req.params.instanceId, req.params.webhookId);
  res.json(await testWebhook(w, req.userId, signPayload));
});

webhooksRouter.delete("/:webhookId/secret", async (req: Request, res: Response) => {
  await removeSecret(req.params.instanceId, req.params.webhookId);
  res.json({ ok: true });
});

// ── /instances/:instanceId/webhook - original single-webhook API ────────────
// Kept for existing integrations: acts on the instance's first webhook.

export const legacyWebhookRouter = Router({ mergeParams: true });
legacyWebhookRouter.use(requireApiKey);
legacyWebhookRouter.use(requireInstanceOwner);

async function primaryView(instanceId: string) {
  const w = await getPrimaryWebhook(instanceId);
  return { url: w?.url ?? null, events: w?.events ?? [], hasSecret: !!w?.secret };
}

legacyWebhookRouter.get("/", async (req: Request, res: Response) => {
  res.json(await primaryView(req.params.instanceId));
});

legacyWebhookRouter.put("/", async (req: Request, res: Response) => {
  const body = z.object({
    url: z.string().url().nullable().optional(),
    events: z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]])).optional(),
    secret: z.string().min(8).max(64).optional(),
  }).parse(req.body);

  const instanceId = req.params.instanceId;
  const w = await getPrimaryWebhook(instanceId);
  if (body.url === null) {
    // url: null switched the webhook off
    if (w) await deleteWebhook(instanceId, w.id);
  } else if (w) {
    await updateWebhook(instanceId, w.id, { url: body.url, events: body.events, secret: body.secret });
  } else if (body.url) {
    await createWebhook(instanceId, { name: "Default", url: body.url, events: body.events ?? [], secret: body.secret });
  }
  res.json(await primaryView(instanceId));
});

legacyWebhookRouter.get("/logs", async (req: Request, res: Response) => {
  res.json(await listLogs(req.params.instanceId));
});

legacyWebhookRouter.post("/test", async (req: Request, res: Response) => {
  const w = await getPrimaryWebhook(req.params.instanceId);
  if (!w) return res.status(400).json({ error: "No webhook URL configured" });
  res.json(await testWebhook(w, req.userId, signPayload));
});

legacyWebhookRouter.delete("/secret", async (req: Request, res: Response) => {
  const w = await getPrimaryWebhook(req.params.instanceId);
  if (w) await removeSecret(req.params.instanceId, w.id);
  res.json({ ok: true });
});
