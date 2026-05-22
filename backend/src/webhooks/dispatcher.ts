import axios from "axios";
import crypto from "crypto";
import { db } from "../db";
import { WebhookEventType } from "./events";
import { logger } from "../utils/logger";
import { config } from "../config";

class WebhookDispatcher {
  async send(instanceId: string, event: WebhookEventType, data: Record<string, unknown>) {
    const instance = await db("instances").where({ id: instanceId }).first();
    if (!instance?.webhook_url) return;

    const subscribedEvents: string[] = instance.webhook_events ?? [];
    if (subscribedEvents.length > 0 && !subscribedEvents.includes(event)) return;

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
      const sig = crypto
        .createHmac("sha256", instance.webhook_secret)
        .update(body)
        .digest("hex");
      headers["X-Webhook-Signature"] = `sha256=${sig}`;
    }

    const maxAttempts = config.webhookMaxRetries;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await axios.post(instance.webhook_url, payload, {
          timeout: config.webhookTimeoutMs,
          headers,
        });
        return;
      } catch (err) {
        logger.warn({ instanceId, event, attempt, err }, "Webhook delivery failed");
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
