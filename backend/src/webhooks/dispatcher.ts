import axios from "axios";
import crypto from "crypto";
import { db } from "../db/index.js";
import { WebhookEventType } from "./events.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { matchesFilters, parseFilters } from "./filters.js";
import { isPrivateUrl, logDelivery, type WebhookRow } from "./store.js";

export { isPrivateUrl };

export function signPayload(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/** Whether a webhook should get this event: enabled, subscribed, and its filters match. */
export function shouldDeliver(w: Pick<WebhookRow, "enabled" | "events" | "filters">, event: string, data: Record<string, unknown>): boolean {
  if (!w.enabled) return false;
  const events = w.events ?? [];
  if (events.length > 0 && !events.includes(event)) return false;
  return matchesFilters(parseFilters(w.filters), event, data);
}

class WebhookDispatcher {
  async send(instanceId: string, event: WebhookEventType, data: Record<string, unknown>) {
    const hooks: WebhookRow[] = await db("webhooks").where({ instance_id: instanceId, enabled: true });
    const targets = hooks.filter((w) => shouldDeliver(w, event, data));
    if (targets.length === 0) return;

    const instance = await db("instances").where({ id: instanceId }).select("user_id").first();
    // Each webhook is delivered independently, so a slow or failing endpoint
    // doesn't hold up the others
    await Promise.allSettled(targets.map((w) => this.deliver(w, instance?.user_id, event, data)));
  }

  private async deliver(w: WebhookRow, userId: string | undefined, event: WebhookEventType, data: Record<string, unknown>) {
    if (isPrivateUrl(w.url)) {
      logger.warn({ instanceId: w.instance_id, webhookId: w.id, url: w.url }, "Webhook URL targets private address, skipping");
      return;
    }

    const payload = {
      instanceId: w.instance_id,
      webhookId: w.id,
      userId,
      event,
      timestamp: Math.floor(Date.now() / 1000),
      data,
    };
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (w.secret) headers["X-Webhook-Signature"] = signPayload(body, w.secret);

    const maxAttempts = config.webhookMaxRetries;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        // Send the exact bytes that were signed
        const resp = await axios.post(w.url, body, { timeout: config.webhookTimeoutMs, headers });
        await logDelivery(w.instance_id, w.id, event, w.url, resp.status, Date.now() - t0, null);
        return;
      } catch (err) {
        const duration = Date.now() - t0;
        const statusCode = axios.isAxiosError(err) ? (err.response?.status ?? null) : null;
        logger.warn({ instanceId: w.instance_id, webhookId: w.id, event, attempt, err }, "Webhook delivery failed");
        if (attempt === maxAttempts) {
          await logDelivery(w.instance_id, w.id, event, w.url, statusCode, duration, err instanceof Error ? err.message : String(err));
        } else {
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
