import axios from "axios";
import { z } from "zod";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { ALL_WEBHOOK_EVENTS } from "./events.js";
import { parseFilters, webhookFiltersSchema, type WebhookFilters } from "./filters.js";
import { AppError } from "../utils/errors.js";

export const MAX_WEBHOOKS_PER_INSTANCE = 10;

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc00:|fd)/;

export function isPrivateUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PRIVATE_HOST_RE.test(host);
  } catch {
    return true; // unparseable → treat as unsafe
  }
}

export type WebhookRow = {
  id: string;
  instance_id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  filters: unknown;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

export function serialize(w: WebhookRow) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events ?? [],
    filters: parseFilters(w.filters),
    enabled: w.enabled,
    hasSecret: !!w.secret,
    createdAt: w.created_at,
    updatedAt: w.updated_at,
  };
}

const eventsSchema = z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]]));
const urlSchema = z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL")
  .refine((u) => !isPrivateUrl(u), "URL targets a private address");

export const createWebhookSchema = z.object({
  name: z.string().max(100).default(""),
  url: urlSchema,
  events: eventsSchema.default(["message.received"]),
  secret: z.string().min(8).max(64).optional(),
  filters: webhookFiltersSchema.default({}),
  enabled: z.boolean().default(true),
});

export const updateWebhookSchema = z.object({
  name: z.string().max(100).optional(),
  url: urlSchema.optional(),
  events: eventsSchema.optional(),
  secret: z.string().min(8).max(64).optional(),
  filters: webhookFiltersSchema.optional(),
  enabled: z.boolean().optional(),
});

export function listWebhooks(instanceId: string): Promise<WebhookRow[]> {
  return db("webhooks").where({ instance_id: instanceId }).orderBy("created_at", "asc");
}

export async function getWebhook(instanceId: string, webhookId: string): Promise<WebhookRow> {
  if (!z.string().uuid().safeParse(webhookId).success) throw new AppError(404, "Webhook not found");
  const row = await db("webhooks").where({ instance_id: instanceId, id: webhookId }).first();
  if (!row) throw new AppError(404, "Webhook not found");
  return row;
}

/** The instance's first webhook: what the single-webhook API and MCP tools act on. */
export async function getPrimaryWebhook(instanceId: string): Promise<WebhookRow | undefined> {
  return db("webhooks").where({ instance_id: instanceId }).orderBy("created_at", "asc").first();
}

export async function createWebhook(instanceId: string, input: z.input<typeof createWebhookSchema>): Promise<WebhookRow> {
  const data = createWebhookSchema.parse(input);
  const [{ count }] = await db("webhooks").where({ instance_id: instanceId }).count<{ count: string }[]>("id as count");
  if (Number(count) >= MAX_WEBHOOKS_PER_INSTANCE) {
    throw new AppError(400, `An instance can have at most ${MAX_WEBHOOKS_PER_INSTANCE} webhooks`);
  }
  const [row] = await db("webhooks")
    .insert({
      instance_id: instanceId,
      name: data.name.trim(),
      url: data.url,
      events: JSON.stringify(data.events),
      secret: data.secret ?? null,
      filters: JSON.stringify(data.filters),
      enabled: data.enabled,
    })
    .returning("*");
  return row;
}

export async function updateWebhook(instanceId: string, webhookId: string, input: z.input<typeof updateWebhookSchema>): Promise<WebhookRow> {
  await getWebhook(instanceId, webhookId);
  const data = updateWebhookSchema.parse(input);
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.url !== undefined) update.url = data.url;
  if (data.events !== undefined) update.events = JSON.stringify(data.events);
  if (data.secret !== undefined) update.secret = data.secret;
  if (data.filters !== undefined) update.filters = JSON.stringify(data.filters);
  if (data.enabled !== undefined) update.enabled = data.enabled;
  const [row] = await db("webhooks").where({ instance_id: instanceId, id: webhookId }).update(update).returning("*");
  return row;
}

export async function deleteWebhook(instanceId: string, webhookId: string): Promise<void> {
  await getWebhook(instanceId, webhookId);
  await db("webhooks").where({ instance_id: instanceId, id: webhookId }).delete();
}

export async function removeSecret(instanceId: string, webhookId: string): Promise<void> {
  await getWebhook(instanceId, webhookId);
  await db("webhooks").where({ instance_id: instanceId, id: webhookId }).update({ secret: null, updated_at: db.fn.now() });
}

export async function logDelivery(
  instanceId: string,
  webhookId: string | null,
  event: string,
  url: string,
  statusCode: number | null,
  durationMs: number | null,
  error: string | null
) {
  await db("webhook_logs")
    .insert({ instance_id: instanceId, webhook_id: webhookId, event, url, status_code: statusCode, duration_ms: durationMs, error })
    .catch(() => {}); // never let logging fail a delivery

  // Prune logs older than 3 hours
  await db("webhook_logs")
    .where("instance_id", instanceId)
    .where("created_at", "<", new Date(Date.now() - 3 * 60 * 60 * 1000))
    .delete()
    .catch(() => {});
}

export function listLogs(instanceId: string, webhookId?: string) {
  const q = db("webhook_logs")
    .where({ instance_id: instanceId })
    .where("created_at", ">=", new Date(Date.now() - 3 * 60 * 60 * 1000));
  if (webhookId) q.where({ webhook_id: webhookId });
  return q.orderBy("created_at", "desc").limit(200)
    .select("id", "webhook_id", "event", "url", "status_code", "duration_ms", "error", "created_at");
}

/** Sends one test payload to a webhook and logs it. */
export async function testWebhook(w: WebhookRow, userId: string | undefined, sign: (body: string, secret: string) => string) {
  if (isPrivateUrl(w.url)) throw new AppError(400, "Webhook URL targets a private address");
  const payload = {
    instanceId: w.instance_id,
    webhookId: w.id,
    userId,
    event: "test",
    timestamp: Math.floor(Date.now() / 1000),
    data: { message: "This is a test delivery from Botsab" },
  };
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (w.secret) headers["X-Webhook-Signature"] = sign(body, w.secret);

  const t0 = Date.now();
  try {
    const resp = await axios.post(w.url, body, { timeout: config.webhookTimeoutMs, headers });
    const durationMs = Date.now() - t0;
    await logDelivery(w.instance_id, w.id, "test", w.url, resp.status, durationMs, null);
    return { success: true, statusCode: resp.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - t0;
    const statusCode = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
    const error = err instanceof Error ? err.message : "Unknown error";
    await logDelivery(w.instance_id, w.id, "test", w.url, statusCode, durationMs, error);
    return { success: false, statusCode, durationMs, error };
  }
}

export type { WebhookFilters };
