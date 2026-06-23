import axios from "axios";
import crypto from "crypto";
import { db } from "../db/index.js";
import { WebhookEventType } from "./events.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc00:|fd)/;

export function isPrivateUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PRIVATE_HOST_RE.test(host);
  } catch {
    return true; // unparseable → treat as unsafe
  }
}

export function signPayload(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function logDelivery(
  instanceId: string,
  event: string,
  url: string,
  statusCode: number | null,
  durationMs: number | null,
  error: string | null
) {
  await db("webhook_logs")
    .insert({ instance_id: instanceId, event, url, status_code: statusCode, duration_ms: durationMs, error })
    .catch(() => {}); // never let logging fail a delivery

  // Prune logs older than 3 hours
  await db("webhook_logs")
    .where("instance_id", instanceId)
    .where("created_at", "<", new Date(Date.now() - 3 * 60 * 60 * 1000))
    .delete()
    .catch(() => {});
}

class WebhookDispatcher {
  async send(instanceId: string, event: WebhookEventType, data: Record<string, unknown>) {
    const instance = await db("instances").where({ id: instanceId }).first();
    if (!instance?.webhook_url) return;

    const subscribedEvents: string[] = instance.webhook_events ?? [];
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(event)) return;

    const url = instance.webhook_url as string;

    if (isPrivateUrl(url)) {
      logger.warn({ instanceId, url }, "Webhook URL targets private address, skipping");
      return;
    }

    const payload = {
      instanceId,
      userId: instance.user_id,
      event,
      timestamp: Math.floor(Date.now() / 1000),
      data,
    };

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (instance.webhook_secret) {
      headers["X-Webhook-Signature"] = signPayload(body, instance.webhook_secret as string);
    }

    const maxAttempts = config.webhookMaxRetries;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const resp = await axios.post(url, payload, { timeout: config.webhookTimeoutMs, headers });
        await logDelivery(instanceId, event, url, resp.status, Date.now() - t0, null);
        return;
      } catch (err) {
        const duration = Date.now() - t0;
        const statusCode = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
        lastError = err instanceof Error ? err.message : String(err);
        logger.warn({ instanceId, event, attempt, err }, "Webhook delivery failed");

        if (attempt === maxAttempts) {
          await logDelivery(instanceId, event, url, statusCode, duration, lastError);
        } else {
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
