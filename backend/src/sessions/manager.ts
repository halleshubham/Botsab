import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { webhookDispatcher } from "../webhooks/dispatcher";
import { config } from "../config";
import { logger } from "../utils/logger";

export type InstanceId = string;

export interface SessionMeta {
  socket: WASocket;
  userId: string;
  instanceId: InstanceId;
  sessionsDir: string;
  qr?: string;
  status: "qr_pending" | "connected" | "disconnected";
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
      browser: ["Botsab", "Chrome", "1.0.0"],
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      // Required for Baileys to handle group encryption retries
      getMessage: async () => ({ conversation: "" }),
    });

    const meta: SessionMeta = {
      socket,
      userId,
      instanceId,
      sessionsDir,
      status: "disconnected",
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
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

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

        // Normalize bot JID: "919607459969:15@s.whatsapp.net" → "919607459969@s.whatsapp.net"
        const rawBotJid = socket.user?.id ?? "";
        const normalizedBotJid = rawBotJid.split(":")[0].split("@")[0] + "@s.whatsapp.net";

        const text =
          msg.message?.conversation ??
          msg.message?.extendedTextMessage?.text ??
          msg.message?.imageMessage?.caption ??
          msg.message?.videoMessage?.caption ??
          null;

        const mentions: string[] =
          (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid as string[] | undefined) ?? [];

        const isMentioned = mentions.includes(normalizedBotJid);

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

    socket.ev.on("contacts.update", async (updates) => {
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
