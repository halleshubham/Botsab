
import { db } from "../db";
import { sessionManager } from "../sessions/manager";
import { logger } from "../utils/logger";

export interface BulkOptions {
  minDelayMs: number;
  maxDelayMs: number;
  batchSize: number;
  batchPauseMs: number;
  shuffle: boolean;
  appendSuffix: boolean;
  suffixType: "invisible" | "hex";
  suffixLength: number;
  sendTypingIndicator: boolean;
  markReadBeforeSend: boolean;
  maxRecipients: number;
}

export const DEFAULT_OPTIONS: BulkOptions = {
  minDelayMs: 4000,
  maxDelayMs: 10000,
  batchSize: 15,
  batchPauseMs: 60000,
  shuffle: true,
  appendSuffix: false,
  suffixType: "invisible",
  suffixLength: 4,
  sendTypingIndicator: true,
  markReadBeforeSend: true,
  maxRecipients: 50,
};

// Hard caps enforced regardless of user options
export const MAX_RECIPIENTS_HARD_CAP = 200;
export const MAX_CONTACTS_PER_LIST = 200;
export const MAX_GROUPS_PER_LIST = 100;
export const MAX_LISTS_PER_USER = 20;

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function invisibleSuffix(length: number): string {
  const chars = ["​", "‌", "‍", "‎", "‏", "﻿"];
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function hexSuffix(length: number): string {
  const hex = "0123456789abcdef";
  return " [" + Array.from({ length }, () => hex[Math.floor(Math.random() * 16)]).join("") + "]";
}

function applySuffix(text: string, opts: BulkOptions): string {
  if (!opts.appendSuffix) return text;
  return opts.suffixType === "hex" ? text + hexSuffix(opts.suffixLength) : text + invisibleSuffix(opts.suffixLength);
}

// Per-campaign cancel flags
const cancelFlags = new Map<string, boolean>();

export function cancelCampaign(campaignId: string): void {
  cancelFlags.set(campaignId, true);
}

export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await db("bulk_campaigns").where({ id: campaignId }).first();
  if (!campaign) return;

  const opts: BulkOptions = { ...DEFAULT_OPTIONS, ...campaign.options };
  const payload = campaign.message_payload;

  // Load recipients from the appropriate list
  let recipients: string[] = [];
  if (campaign.list_type === "contact") {
    const members = await db("contact_list_members")
      .where({ list_id: campaign.list_id })
      .select("phone_number");
    recipients = members.map((m: { phone_number: string }) => `${m.phone_number}@s.whatsapp.net`);
  } else {
    const members = await db("group_list_members")
      .where({ list_id: campaign.list_id })
      .select("group_jid");
    recipients = members.map((m: { group_jid: string }) =>
      m.group_jid.endsWith("@g.us") ? m.group_jid : `${m.group_jid}@g.us`
    );
  }

  const capped = recipients.slice(0, Math.min(opts.maxRecipients, MAX_RECIPIENTS_HARD_CAP));
  if (opts.shuffle) shuffle(capped);

  await db("bulk_campaigns").where({ id: campaignId }).update({
    status: "running",
    total_count: capped.length,
    started_at: new Date(),
  });

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < capped.length; i++) {
    if (cancelFlags.get(campaignId)) {
      cancelFlags.delete(campaignId);
      await db("bulk_campaigns").where({ id: campaignId }).update({ status: "cancelled", completed_at: new Date() });
      return;
    }

    const target = capped[i];
    const meta = sessionManager.getSession(campaign.instance_id);

    if (!meta || meta.status !== "connected") {
      await db("bulk_campaign_results").insert({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        recipient: target,
        status: "skipped",
        error: "Instance disconnected",
        sent_at: null,
      });
      skippedCount++;
      await db("bulk_campaigns").where({ id: campaignId }).update({ skipped_count: skippedCount });
      continue;
    }

    // Mark chat as read before sending so the bot appears to have "seen" the conversation
    if (opts.markReadBeforeSend) {
      try {
        await meta.socket.chatModify({ markRead: true, lastMessages: [] }, target);
      } catch {}
    }

    // Simulate typing indicator
    if (opts.sendTypingIndicator) {
      try {
        await meta.socket.sendPresenceUpdate("composing", target);
        await randomDelay(700, 1800);
        await meta.socket.sendPresenceUpdate("paused", target);
      } catch {}
    }

    // Build message content
    let content: Record<string, unknown>;
    switch (payload.type) {
      case "text":
        content = { text: applySuffix(payload.text as string, opts) };
        break;
      case "image":
        content = {
          image: { url: payload.url },
          caption: payload.caption ? applySuffix(payload.caption as string, opts) : undefined,
        };
        break;
      case "document":
        content = { document: { url: payload.url }, fileName: payload.filename, mimetype: payload.mimetype };
        break;
      case "video":
        content = {
          video: { url: payload.url },
          caption: payload.caption ? applySuffix(payload.caption as string, opts) : undefined,
        };
        break;
      default:
        content = { text: "" };
    }

    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await meta.socket.sendMessage(target, content as Parameters<typeof meta.socket.sendMessage>[1]);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "";
          if (msg === "No sessions" && attempt < 3) {
            await randomDelay(3000 * attempt, 5000 * attempt);
            continue;
          }
          throw err;
        }
      }
      await db("bulk_campaign_results").insert({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        recipient: target,
        status: "sent",
        sent_at: new Date(),
      });
      sentCount++;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      await db("bulk_campaign_results").insert({
        id: crypto.randomUUID(),
        campaign_id: campaignId,
        recipient: target,
        status: "failed",
        error,
        sent_at: null,
      });
      failedCount++;
      logger.warn({ campaignId, target, error }, "Bulk send failed for recipient");
    }

    await db("bulk_campaigns")
      .where({ id: campaignId })
      .update({ sent_count: sentCount, failed_count: failedCount, skipped_count: skippedCount });

    if (i < capped.length - 1) {
      if ((i + 1) % opts.batchSize === 0) {
        logger.info({ campaignId, batch: Math.ceil((i + 1) / opts.batchSize) }, "Batch complete, long pause");
        // Extra jitter on batch pause to avoid predictable patterns
        await randomDelay(opts.batchPauseMs, opts.batchPauseMs + 15000);
      } else {
        await randomDelay(opts.minDelayMs, opts.maxDelayMs);
      }
    }
  }

  await db("bulk_campaigns").where({ id: campaignId }).update({
    status: "completed",
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    completed_at: new Date(),
  });

  logger.info({ campaignId, sentCount, failedCount, skippedCount }, "Campaign completed");
}
