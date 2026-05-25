
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
  // Anti-ban additions
  sendStartHour: number;    // 0–23: don't start new sends before this local hour
  sendEndHour: number;      // 0–23: don't start new sends at or after this hour
  dailyLimit: number;       // max total sends per instance per calendar day
  checkNumberExists: boolean; // validate contacts are registered on WhatsApp before sending
  respectOptOut: boolean;   // skip numbers that replied STOP / unsubscribe
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
  sendStartHour: 8,
  sendEndHour: 21,
  dailyLimit: 150,
  checkNumberExists: true,
  respectOptOut: true,
};

// Hard caps enforced regardless of user options
export const MAX_RECIPIENTS_HARD_CAP = 200;
export const MAX_CONTACTS_PER_LIST = 200;
export const MAX_GROUPS_PER_LIST = 100;
export const MAX_LISTS_PER_USER = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Pick a random variant from the payload, or fall back to the primary text
function pickText(payload: Record<string, unknown>): string {
  const variants = payload.variants as string[] | undefined;
  if (Array.isArray(variants) && variants.length > 0) {
    return variants[Math.floor(Math.random() * variants.length)];
  }
  return payload.text as string;
}

// Sleep until the start of the next allowed send window
async function sleepUntilSendWindow(start: number, end: number, campaignId: string): Promise<void> {
  const now = new Date();
  const h = now.getHours();
  if (h >= start && h < end) return;

  const next = new Date(now);
  if (h >= end) next.setDate(next.getDate() + 1);
  next.setHours(start, 0, 30, 0); // 30 s into the hour avoids edge-case re-entry
  const waitMs = next.getTime() - now.getTime();
  logger.info({ campaignId, until: next.toISOString() }, "Outside send window, sleeping");
  await new Promise((r) => setTimeout(r, waitMs));
}

// In-memory daily sent count (resets on server restart, acceptable)
const dailySentCounts = new Map<string, number>();

function dailyKey(instanceId: string): string {
  return `${instanceId}:${new Date().toISOString().slice(0, 10)}`;
}

function getDailySent(instanceId: string): number {
  return dailySentCounts.get(dailyKey(instanceId)) ?? 0;
}

function incrementDailySent(instanceId: string): void {
  const key = dailyKey(instanceId);
  dailySentCounts.set(key, (dailySentCounts.get(key) ?? 0) + 1);
}

// ── Cancel flags ─────────────────────────────────────────────────────────────

const cancelFlags = new Map<string, boolean>();

export function cancelCampaign(campaignId: string): void {
  cancelFlags.set(campaignId, true);
}

// ── Main runner ──────────────────────────────────────────────────────────────

export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await db("bulk_campaigns").where({ id: campaignId }).first();
  if (!campaign) return;

  const opts: BulkOptions = { ...DEFAULT_OPTIONS, ...campaign.options };
  const payload = campaign.message_payload;

  // ── 1. Load raw recipients ──────────────────────────────────────────────
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

  const meta = sessionManager.getSession(campaign.instance_id);

  // ── 2. Filter opt-outs ────────────────────────────────────────────────
  if (opts.respectOptOut && recipients.length > 0) {
    const optedOut = await db("opt_outs")
      .where({ instance_id: campaign.instance_id })
      .whereIn("jid", recipients)
      .pluck("jid") as string[];
    if (optedOut.length > 0) {
      const optedOutSet = new Set(optedOut);
      const before = recipients.length;
      recipients = recipients.filter((j) => !optedOutSet.has(j));
      logger.info({ campaignId, removed: before - recipients.length }, "Filtered opt-outs");
    }
  }

  // ── 3. Validate numbers exist on WhatsApp (contact lists only) ────────
  if (opts.checkNumberExists && campaign.list_type === "contact" && recipients.length > 0 && meta?.status === "connected") {
    const CHUNK = 20;
    const valid: string[] = [];
    let invalidCount = 0;

    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      try {
        const results = (await meta.socket.onWhatsApp(...chunk)) ?? [];
        for (let j = 0; j < chunk.length; j++) {
          if (results[j]?.exists) {
            valid.push(chunk[j]);
          } else {
            invalidCount++;
          }
        }
        if (i + CHUNK < recipients.length) await randomDelay(800, 2000);
      } catch {
        // Fail open: include all in this chunk if check errors
        valid.push(...chunk);
      }
    }

    logger.info({ campaignId, valid: valid.length, invalid: invalidCount }, "Number existence check done");
    recipients = valid;
  }

  // ── 4. Cap and shuffle ────────────────────────────────────────────────
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

  // ── 5. Send loop ──────────────────────────────────────────────────────
  for (let i = 0; i < capped.length; i++) {
    if (cancelFlags.get(campaignId)) {
      cancelFlags.delete(campaignId);
      await db("bulk_campaigns").where({ id: campaignId }).update({ status: "cancelled", completed_at: new Date() });
      return;
    }

    // Human hours enforcement: pause until the allowed window
    if (opts.sendStartHour !== 0 || opts.sendEndHour !== 24) {
      await sleepUntilSendWindow(opts.sendStartHour, opts.sendEndHour, campaignId);
    }

    // Daily limit: pause until the next window if limit reached
    if (getDailySent(campaign.instance_id) >= opts.dailyLimit) {
      logger.info({ campaignId, dailyLimit: opts.dailyLimit }, "Daily limit reached, sleeping until next window");
      await sleepUntilSendWindow(opts.sendStartHour, opts.sendEndHour, campaignId);
      // If the day rolled over, count may have reset; if not, keep checking
      if (getDailySent(campaign.instance_id) >= opts.dailyLimit) {
        await db("bulk_campaigns").where({ id: campaignId }).update({
          status: "cancelled",
          completed_at: new Date(),
          skipped_count: skippedCount + (capped.length - i),
        });
        logger.warn({ campaignId }, "Daily limit still exceeded after window, cancelling remainder");
        return;
      }
    }

    const target = capped[i];
    const currentMeta = sessionManager.getSession(campaign.instance_id);

    if (!currentMeta || currentMeta.status !== "connected") {
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

    if (opts.markReadBeforeSend) {
      try {
        await currentMeta.socket.chatModify({ markRead: true, lastMessages: [] }, target);
      } catch {}
    }

    if (opts.sendTypingIndicator) {
      try {
        await currentMeta.socket.sendPresenceUpdate("composing", target);
        await randomDelay(700, 1800);
        await currentMeta.socket.sendPresenceUpdate("paused", target);
      } catch {}
    }

    // Build message content — pick a random variant if provided
    let content: Record<string, unknown>;
    switch (payload.type) {
      case "text":
        content = { text: applySuffix(pickText(payload), opts) };
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
          await currentMeta.socket.sendMessage(target, content as Parameters<typeof currentMeta.socket.sendMessage>[1]);
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
      incrementDailySent(campaign.instance_id);
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
