
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { db } from "../db/index.js";
import { sessionManager } from "../sessions/manager.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { isPrivateUrl } from "../webhooks/dispatcher.js";

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
  minDelayMs: 10_000,     // 10s — safe floor for both text and image
  maxDelayMs: 25_000,     // 25s — image upload + delivery needs headroom
  batchSize: 10,          // 10 messages per batch (was 15)
  batchPauseMs: 120_000,  // 2 min between batches (was 1 min)
  shuffle: true,
  appendSuffix: false,
  suffixType: "invisible",
  suffixLength: 4,
  sendTypingIndicator: true,
  markReadBeforeSend: true,
  maxRecipients: 50,
  sendStartHour: 8,
  sendEndHour: 21,
  dailyLimit: 100,        // 100/day (was 150)
  checkNumberExists: true,
  respectOptOut: true,
};

// Conservative defaults for group campaigns — groups reach many people at once,
// so WhatsApp's reach-based detection is far more aggressive.
export const DEFAULT_GROUP_OPTIONS: BulkOptions = {
  minDelayMs: 180_000,     // 3 min between groups
  maxDelayMs: 480_000,     // 8 min between groups
  batchSize: 2,            // 2 groups per batch
  batchPauseMs: 2_700_000, // 45 min after each batch
  shuffle: true,
  appendSuffix: false,
  suffixType: "invisible",
  suffixLength: 4,
  sendTypingIndicator: true,  // groups show "typing" to members — simulates active user
  markReadBeforeSend: true,   // mark group as read before posting — simulates active user
  maxRecipients: 10,          // max 10 groups per run
  sendStartHour: 9,
  sendEndHour: 18,
  dailyLimit: 8,              // max 8 groups per day
  checkNumberExists: false,   // N/A for groups
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

class CampaignCancelledError extends Error {}

// Sleep in short slices so a cancel request takes effect within seconds, even
// during multi-minute batch pauses or overnight send-window waits.
async function cancellableSleep(ms: number, campaignId: string): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cancelFlags.get(campaignId)) throw new CampaignCancelledError();
    await new Promise((r) => setTimeout(r, Math.min(5_000, end - Date.now())));
  }
  if (cancelFlags.get(campaignId)) throw new CampaignCancelledError();
}

function randomCancellableDelay(min: number, max: number, campaignId: string): Promise<void> {
  return cancellableSleep(Math.floor(Math.random() * (max - min + 1)) + min, campaignId);
}

// Reject if a socket call hangs — one stuck call must not freeze the whole campaign.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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

// Pick a random caption variant, or fall back to the primary caption
function pickCaption(payload: Record<string, unknown>): string | undefined {
  const variants = payload.captionVariants as string[] | undefined;
  if (Array.isArray(variants) && variants.length > 0) {
    return variants[Math.floor(Math.random() * variants.length)];
  }
  return payload.caption as string | undefined;
}

// Re-encode image as JPEG with a random quality (82–96) so each send produces
// a unique file hash — defeats WhatsApp's same-image broadcast detection.
async function randomizeImageBuffer(input: Buffer): Promise<Buffer> {
  const quality = 82 + Math.floor(Math.random() * 15);
  const subsampling = Math.random() < 0.5 ? ("4:2:0" as const) : ("4:4:4" as const);
  try {
    return await sharp(input)
      .jpeg({ quality, chromaSubsampling: subsampling })
      .toBuffer();
  } catch {
    return input; // non-JPEG or unsupported format — send as-is
  }
}

// Hour and date in the configured timezone (TIMEZONE env), not the container's
// clock — containers run in UTC, which shifted the send window by hours.
function zonedNow(): { hour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { hour: parseInt(get("hour"), 10), date: `${get("year")}-${get("month")}-${get("day")}` };
}

function inSendWindow(start: number, end: number): boolean {
  const { hour } = zonedNow();
  if (start === end) return true;
  // Windows like 22 → 6 wrap past midnight
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

// Sleep until the allowed send window opens
async function waitForSendWindow(start: number, end: number, campaignId: string): Promise<void> {
  if (inSendWindow(start, end)) return;
  logger.info({ campaignId, start, end, timezone: config.timezone, hour: zonedNow().hour }, "Outside send window, waiting");
  while (!inSendWindow(start, end)) await cancellableSleep(60_000, campaignId);
  logger.info({ campaignId }, "Send window open, resuming");
}

// In-memory daily sent count (resets on server restart, acceptable)
const dailySentCounts = new Map<string, number>();

function dailyKey(instanceId: string): string {
  return `${instanceId}:${zonedNow().date}`;
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

// ── Instance queue + lock ─────────────────────────────────────────────────────
// One campaign runs per instance at a time. Additional campaigns wait in a
// per-instance FIFO queue so they never overlap and flood the WhatsApp socket.

const instanceQueues = new Map<string, string[]>(); // instanceId → [campaignId, ...]
const instanceLocks  = new Set<string>();            // instanceId → currently running

export function enqueueCampaign(instanceId: string, campaignId: string): void {
  if (!instanceLocks.has(instanceId)) {
    instanceLocks.add(instanceId);
    _runWithLock(instanceId, campaignId);
  } else {
    if (!instanceQueues.has(instanceId)) instanceQueues.set(instanceId, []);
    instanceQueues.get(instanceId)!.push(campaignId);
    const pos = instanceQueues.get(instanceId)!.length;
    db("bulk_campaigns").where({ id: campaignId }).update({ status: "queued" }).catch(() => {});
    logger.info({ instanceId, campaignId, queuePosition: pos }, "Campaign queued — instance busy");
  }
}

async function _runWithLock(instanceId: string, campaignId: string): Promise<void> {
  try {
    await runCampaign(campaignId);
  } catch (err) {
    if (err instanceof CampaignCancelledError) {
      logger.info({ instanceId, campaignId }, "Campaign cancelled");
      await db("bulk_campaigns")
        .where({ id: campaignId })
        .update({ status: "cancelled", completed_at: new Date() })
        .catch(() => {});
      return;
    }
    logger.error({ instanceId, campaignId, err }, "Campaign runner threw");
    db("bulk_campaigns")
      .where({ id: campaignId })
      .update({ status: "failed", completed_at: new Date() })
      .catch(() => {});
  } finally {
    cancelFlags.delete(campaignId);
    instanceLocks.delete(instanceId);
    const queue = instanceQueues.get(instanceId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) instanceQueues.delete(instanceId);
      instanceLocks.add(instanceId);
      _runWithLock(instanceId, next);
    }
  }
}

/** Returns queue metadata for a given instance. */
export function getQueueInfo(instanceId: string): { busy: boolean; queued: string[] } {
  return {
    busy: instanceLocks.has(instanceId),
    queued: [...(instanceQueues.get(instanceId) ?? [])],
  };
}

/** Cancel a campaign. If it hasn't started yet, removes it from the queue immediately. */
export function cancelCampaign(campaignId: string, instanceId?: string): void {
  if (instanceId) {
    const queue = instanceQueues.get(instanceId);
    if (queue) {
      const idx = queue.indexOf(campaignId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        if (queue.length === 0) instanceQueues.delete(instanceId);
        db("bulk_campaigns")
          .where({ id: campaignId })
          .update({ status: "cancelled", completed_at: new Date() })
          .catch(() => {});
        logger.info({ instanceId, campaignId }, "Queued campaign cancelled before running");
        return;
      }
    }
  }
  // Running campaign — signal the loop to stop after the current message
  cancelFlags.set(campaignId, true);
}

// ── Main runner ──────────────────────────────────────────────────────────────

export async function runCampaign(campaignId: string): Promise<void> {
  const campaign = await db("bulk_campaigns").where({ id: campaignId }).first();
  if (!campaign) return;

  const baseDefaults = campaign.list_type === "group" ? DEFAULT_GROUP_OPTIONS : DEFAULT_OPTIONS;
  const opts: BulkOptions = { ...baseDefaults, ...campaign.options };
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
        // onWhatsApp returns only the registered numbers, in server order —
        // match by phone number, never by index.
        const results = (await withTimeout(meta.socket.onWhatsApp(...chunk), 30_000, "onWhatsApp")) ?? [];
        const phoneOf = (jid: string) => jid.split("@")[0].split(":")[0];
        const registered = new Set(results.filter((r) => r.exists).map((r) => phoneOf(r.jid)));
        const matched = chunk.filter((jid) => registered.has(phoneOf(jid)));
        if (results.length > 0 && matched.length === 0) {
          // Server answered with IDs we can't map back (e.g. LIDs) — fail open
          logger.warn({ campaignId }, "Number check results could not be matched, keeping chunk");
          valid.push(...chunk);
        } else {
          valid.push(...matched);
          invalidCount += chunk.length - matched.length;
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

  // ── 4b. Pre-load image buffer (once) for randomization per send ───────
  let baseImageBuffer: Buffer | null = null;
  if (payload.type === "image") {
    if (payload.fileId) {
      try {
        baseImageBuffer = fs.readFileSync(path.resolve(config.uploadsDir, path.basename(payload.fileId as string)));
      } catch { /* file missing — will fail per-send */ }
    } else if (payload.url) {
      try {
        if (!isPrivateUrl(payload.url as string)) {
          const resp = await fetch(payload.url as string, { signal: AbortSignal.timeout(30_000) });
          baseImageBuffer = Buffer.from(await resp.arrayBuffer());
        }
      } catch { /* URL unreachable — fall back to URL reference per-send */ }
    }
  }

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
    if (cancelFlags.get(campaignId)) throw new CampaignCancelledError();

    // Human hours enforcement: pause until the allowed window
    await waitForSendWindow(opts.sendStartHour, opts.sendEndHour, campaignId);

    // Daily limit: wait for the next day's window, then carry on
    if (getDailySent(campaign.instance_id) >= opts.dailyLimit) {
      const today = zonedNow().date;
      logger.info({ campaignId, dailyLimit: opts.dailyLimit }, "Daily limit reached, waiting for next day");
      while (zonedNow().date === today) await cancellableSleep(60_000, campaignId);
      await waitForSendWindow(opts.sendStartHour, opts.sendEndHour, campaignId);
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
        const lastKey = sessionManager.getLastMsgKey(campaign.instance_id, target);
        logger.info({ campaignId, target, lastKey: lastKey ?? null }, "markRead: attempting");
        if (lastKey) {
          await withTimeout(currentMeta.socket.readMessages([lastKey]), 10_000, "readMessages");
          logger.info({ campaignId, target }, "markRead: readMessages sent");
        } else {
          await withTimeout(currentMeta.socket.chatModify({ markRead: true, lastMessages: [] }, target), 10_000, "chatModify");
          logger.info({ campaignId, target }, "markRead: chatModify fallback sent");
        }
      } catch (err) {
        logger.warn({ campaignId, target, err }, "markRead: failed");
      }
    }

    if (opts.sendTypingIndicator) {
      try {
        await withTimeout(currentMeta.socket.sendPresenceUpdate("composing", target), 10_000, "presence");
        await randomDelay(700, 1800);
        await withTimeout(currentMeta.socket.sendPresenceUpdate("paused", target), 10_000, "presence");
      } catch {}
    }

    // Build message content — pick a random variant if provided
    let content: Record<string, unknown>;
    switch (payload.type) {
      case "text":
        content = { text: applySuffix(pickText(payload), opts) };
        break;
      case "image": {
        const cap = pickCaption(payload);
        if (baseImageBuffer) {
          // Re-encode with random quality → unique hash per send
          const randomized = await randomizeImageBuffer(baseImageBuffer);
          content = {
            image: randomized,
            caption: cap ? applySuffix(cap, opts) : undefined,
            mimetype: "image/jpeg",
          };
        } else {
          content = {
            image: { url: payload.url as string },
            caption: cap ? applySuffix(cap, opts) : undefined,
            mimetype: payload.mimeType as string | undefined,
          };
        }
        break;
      }
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
          await withTimeout(
            currentMeta.socket.sendMessage(target, content as Parameters<typeof currentMeta.socket.sendMessage>[1]),
            120_000,
            "sendMessage"
          );
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
        await randomCancellableDelay(opts.batchPauseMs, opts.batchPauseMs + 15000, campaignId);
      } else {
        await randomCancellableDelay(opts.minDelayMs, opts.maxDelayMs, campaignId);
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
