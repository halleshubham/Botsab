import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { webhookDispatcher } from "../webhooks/dispatcher";
import { config } from "../config";
import { logger } from "../utils/logger";

// Keywords that indicate a recipient wants to opt out of messages
const OPT_OUT_PATTERNS = [
  /^\s*stop\b/i,
  /^\s*unsubscribe\b/i,
  /^\s*opt.?out\b/i,
  /^\s*remove\s+me\b/i,
  /^\s*do\s+not\s+(contact|message)\b/i,
  /^\s*please\s+(stop|don['']?t|do\s+not)\b/i,
];

export type InstanceId = string;

export interface SessionMeta {
  socket: WASocket;
  userId: string;
  instanceId: InstanceId;
  sessionsDir: string;
  qr?: string;
  status: "qr_pending" | "connected" | "disconnected";
  presenceActive: boolean; // controls the presence-cycling loop
}

// ── Presence simulation ───────────────────────────────────────────────────────
// Cycles the instance between "available" and "unavailable" to mimic a human
// opening/closing WhatsApp throughout the day.

const PRESENCE_ACTIVE_START = 8;  // hour (local server time) when account "wakes up"
const PRESENCE_ACTIVE_END   = 22; // hour when account "goes to sleep"

function randMs(minMin: number, maxMin: number): number {
  return (minMin + Math.random() * (maxMin - minMin)) * 60_000;
}

async function runPresenceCycle(meta: SessionMeta): Promise<void> {
  if (!meta.presenceActive) return;

  const hour = new Date().getHours();
  const isDay = hour >= PRESENCE_ACTIVE_START && hour < PRESENCE_ACTIVE_END;

  try {
    // During active hours: online ~60% of checks; always offline at night
    const goOnline = isDay && Math.random() < 0.6;
    await meta.socket.sendPresenceUpdate(goOnline ? "available" : "unavailable");
  } catch { /* socket may not be ready yet */ }

  // Re-schedule: every 20–50 minutes during the day, less often at night
  const delay = isDay ? randMs(20, 50) : randMs(40, 90);
  setTimeout(() => runPresenceCycle(meta), delay);
}

class SessionManager {
  private sessions = new Map<InstanceId, SessionMeta>();
  private listeners = new Map<InstanceId, Set<(event: string, data: object) => void>>();

  sessionDir(instanceId: InstanceId): string {
    return path.resolve(config.sessionsDir, instanceId);
  }

  async createSession(userId: string, instanceId: InstanceId): Promise<void> {
    if (this.sessions.has(instanceId)) return;

    const sessionsDir = this.sessionDir(instanceId);
    await fs.mkdir(sessionsDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      // Required for Baileys to handle group encryption retries
      getMessage: async () => ({ conversation: "" }),
    });

    const meta: SessionMeta = {
      socket,
      userId,
      instanceId,
      sessionsDir,
      status: "disconnected",
      presenceActive: false,
    };

    this.sessions.set(instanceId, meta);

    socket.ev.on("creds.update", saveCreds);

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        meta.qr = qr;
        meta.status = "qr_pending";
        await this.syncStatus(instanceId, "qr_pending");
        this.emit(instanceId, "qr", { qr });
        await webhookDispatcher.send(instanceId, "qr", { qr });
      }

      if (connection === "open") {
        meta.status = "connected";
        meta.qr = undefined;
        const jid = socket.user?.id;
        const phone = jid ? jid.split(":")[0].split("@")[0] : null;
        await this.syncStatus(instanceId, "connected", phone ?? undefined);
        this.emit(instanceId, "connection.open", { phone });
        await webhookDispatcher.send(instanceId, "connection.open", { phone });
        logger.info({ instanceId, phone }, "Instance connected");

        // Start human-like presence cycling (2–8 min initial delay to avoid
        // an immediate "available" burst right after connect)
        meta.presenceActive = true;
        setTimeout(() => runPresenceCycle(meta), randMs(2, 8));
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        meta.presenceActive = false; // stops the presence-cycling loop
        meta.status = "disconnected";
        this.sessions.delete(instanceId);
        await this.syncStatus(instanceId, "disconnected");
        this.emit(instanceId, "connection.close", { statusCode, shouldReconnect });
        await webhookDispatcher.send(instanceId, "connection.close", { statusCode, shouldReconnect });

        logger.info({ instanceId, statusCode, shouldReconnect }, "Instance disconnected");

        if (shouldReconnect) {
          setTimeout(() => this.createSession(userId, instanceId).catch((err) => {
            logger.error({ instanceId, err }, "Reconnection failed");
          }), 5_000);
        } else {
          await fs.rm(sessionsDir, { recursive: true, force: true });
        }
      }
    });

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid ?? "";
        const isGroup = remoteJid.endsWith("@g.us");
        const senderId = isGroup ? (msg.key.participant ?? "") : remoteJid;

        // Strip device suffix while keeping the domain: "919607459969:15@s.whatsapp.net" → "919607459969@s.whatsapp.net"
        const normalizeJid = (jid: string) => {
          const atIdx = jid.lastIndexOf("@");
          const domain = atIdx !== -1 ? jid.slice(atIdx) : "@s.whatsapp.net";
          const user = (atIdx !== -1 ? jid.slice(0, atIdx) : jid).split(":")[0];
          return user + domain;
        };

        const rawBotJid = socket.user?.id ?? "";
        const normalizedBotJid = normalizeJid(rawBotJid);
        // Bot may also appear as a @lid JID in newer WhatsApp groups
        const normalizedBotLid = socket.user?.lid ? normalizeJid(socket.user.lid) : null;

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          msg.message?.imageMessage?.caption ??
          msg.message?.videoMessage?.caption ??
          null;

        const mentions: string[] =
          ((msg.message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined) ?? [])
            .map(normalizeJid);

        const isMentioned =
          mentions.includes(normalizedBotJid) ||
          (normalizedBotLid !== null && mentions.includes(normalizedBotLid));

        const enriched = {
          id: msg.key.id,
          remoteJid,
          isGroup,
          groupId: isGroup ? remoteJid : null,
          senderId,
          text,
          mentions,
          isMentioned,
        };

        // Opt-out detection: record STOP/unsubscribe replies so bulk campaigns skip this contact
        if (text && OPT_OUT_PATTERNS.some((p) => p.test(text))) {
          const optOutJid = normalizeJid(senderId);
          db("opt_outs")
            .insert({ id: crypto.randomUUID(), instance_id: instanceId, jid: optOutJid })
            .onConflict(["instance_id", "jid"])
            .ignore()
            .catch(() => {});
          logger.info({ instanceId, jid: optOutJid }, "Opt-out recorded");
        }

        this.emit(instanceId, "message.received", { message: msg, enriched });
        await webhookDispatcher.send(instanceId, "message.received", {
          message: msg as unknown as Record<string, unknown>,
          enriched,
        });
      }
    });

    socket.ev.on("message-receipt.update", async (updates) => {
      this.emit(instanceId, "message.receipt", { updates });
      await webhookDispatcher.send(instanceId, "message.receipt", { updates: updates as unknown as Record<string, unknown>[] });
    });

    socket.ev.on("groups.update", async (updates) => {
      this.emit(instanceId, "group.update", { updates });
      await webhookDispatcher.send(instanceId, "group.update", { updates: updates as unknown as Record<string, unknown>[] });
    });

    // Persist contacts to DB so the UI can offer a "pick from phone contacts" picker.
    // Only store regular @s.whatsapp.net JIDs (not groups, broadcasts, or status).
    socket.ev.on("contacts.upsert", async (contacts) => {
      const rows = contacts
        .filter((c) => c.id.endsWith("@s.whatsapp.net"))
        .map((c) => ({
          id: crypto.randomUUID(),
          instance_id: instanceId,
          jid: c.id,
          phone_number: c.id.split(":")[0].split("@")[0],
          name: c.name ?? null,
          notify: c.notify ?? null,
          updated_at: new Date(),
        }));
      if (rows.length === 0) return;
      await db("whatsapp_contacts")
        .insert(rows)
        .onConflict(["instance_id", "jid"])
        .merge(["name", "notify", "updated_at"])
        .catch(() => {});
    });

    socket.ev.on("contacts.update", async (updates) => {
      for (const upd of updates) {
        if (!upd.id.endsWith("@s.whatsapp.net")) continue;
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (upd.name !== undefined) patch.name = upd.name;
        if (upd.notify !== undefined) patch.notify = upd.notify;
        db("whatsapp_contacts")
          .where({ instance_id: instanceId, jid: upd.id })
          .update(patch)
          .catch(() => {});
      }
      this.emit(instanceId, "contact.update", { updates });
      await webhookDispatcher.send(instanceId, "contact.update", { updates: updates as unknown as Record<string, unknown>[] });
    });
  }

  getSession(instanceId: InstanceId): SessionMeta | undefined {
    return this.sessions.get(instanceId);
  }

  async destroySession(instanceId: InstanceId, purge = false): Promise<void> {
    const meta = this.sessions.get(instanceId);
    if (!meta) return;
    meta.presenceActive = false;
    try {
      await meta.socket.logout();
    } catch {}
    this.sessions.delete(instanceId);
    await this.syncStatus(instanceId, "disconnected");
    if (purge) {
      await fs.rm(meta.sessionsDir, { recursive: true, force: true });
    }
  }

  async disconnectSession(instanceId: InstanceId): Promise<void> {
    const meta = this.sessions.get(instanceId);
    if (!meta) return;
    meta.presenceActive = false;
    try {
      await meta.socket.end(undefined);
    } catch {}
    this.sessions.delete(instanceId);
    await this.syncStatus(instanceId, "disconnected");
  }

  subscribe(instanceId: InstanceId, fn: (event: string, data: object) => void): () => void {
    if (!this.listeners.has(instanceId)) this.listeners.set(instanceId, new Set());
    this.listeners.get(instanceId)!.add(fn);
    return () => this.listeners.get(instanceId)?.delete(fn);
  }

  private emit(instanceId: InstanceId, event: string, data: object) {
    this.listeners.get(instanceId)?.forEach((fn) => fn(event, data));
  }

  private async syncStatus(instanceId: InstanceId, status: string, phoneNumber?: string) {
    const update: Record<string, unknown> = { status };
    if (phoneNumber) update.phone_number = phoneNumber;
    await db("instances").where({ id: instanceId }).update(update);
  }
}

export const sessionManager = new SessionManager();
