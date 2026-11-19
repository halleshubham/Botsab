import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { sessionManager } from "../sessions/manager.js";
import { config } from "../config.js";
import { buildMentions } from "../services/mentions.js";
import { downloadVideo, prepareVideoForWhatsApp } from "../services/videoMeta.js";
import { downloadMediaMessage, type proto } from "@whiskeysockets/baileys";
import pino from "pino";
import { assertDownloadableMedia, describeMedia, quotedOption } from "../services/incoming.js";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

const jidSchema = z.string().regex(/^[^@]+@(s\.whatsapp\.net|g\.us)$/, "Invalid JID format");

// Group-only mention options (ignored for individual chats): mentionAll is
// WhatsApp's native @all, tagAll mentions every member individually
const mentionFields = { mentionAll: z.boolean().optional(), tagAll: z.boolean().optional() };

// Reply to a specific message: id from the webhook's enriched.id (or enriched.quoted.id);
// participant = its sender in groups; message = its content for the quote preview
const quotedSchema = z.object({
  id: z.string().min(1),
  participant: z.string().optional(),
  fromMe: z.boolean().optional(),
  message: z.record(z.any()).optional(),
});
const replyFields = { quoted: quotedSchema.optional() };

const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), to: jidSchema, text: z.string().min(1), ...mentionFields, ...replyFields }),
  z.object({ type: z.literal("image"), to: jidSchema, url: z.string().url().optional(), fileId: z.string().optional(), caption: z.string().optional(), ...mentionFields, ...replyFields }),
  z.object({ type: z.literal("document"), to: jidSchema, url: z.string().url(), filename: z.string(), mimetype: z.string(), ...replyFields }),
  z.object({ type: z.literal("audio"), to: jidSchema, url: z.string().url(), ptt: z.boolean().optional(), ...replyFields }),
  z.object({ type: z.literal("video"), to: jidSchema, url: z.string().url().optional(), fileId: z.string().optional(), caption: z.string().optional(), ...mentionFields, ...replyFields }),
]);

async function sendSingleMessage(instanceId: string, body: z.infer<typeof sendSchema>) {
  const meta = sessionManager.getSession(instanceId);
  if (!meta || meta.status !== "connected") throw new Error("Instance not connected");

  if (body.type === "image" && !body.url && !body.fileId) {
    throw new Error("Either url or fileId is required for image");
  }
  if (body.type === "video" && !body.url && !body.fileId) {
    throw new Error("Either url or fileId is required for video");
  }

  let content: Record<string, unknown> = {};
  switch (body.type) {
    case "text":    content = { text: body.text }; break;
    case "image": {
      if (body.fileId) {
        const filePath = path.resolve(config.uploadsDir, path.basename(body.fileId));
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        content = { image: fs.readFileSync(filePath), caption: body.caption };
      } else {
        content = { image: { url: body.url! }, caption: body.caption };
      }
      break;
    }
    case "document": content = { document: { url: body.url }, fileName: body.filename, mimetype: body.mimetype }; break;
    case "audio":   content = { audio: { url: body.url }, ptt: body.ptt ?? false }; break;
    case "video": {
      if (body.fileId) {
        const filePath = path.resolve(config.uploadsDir, path.basename(body.fileId));
        if (!fs.existsSync(filePath)) throw new Error("File not found");
        const { media, meta } = await prepareVideoForWhatsApp(filePath);
        content = { video: media, caption: body.caption, mimetype: "video/mp4", ...meta };
      } else {
        // Download first so a URL gets the same compatibility check, re-encode
        // and duration/dimensions as an uploaded file; fall back to letting
        // Baileys fetch the URL itself if the download isn't possible.
        const downloaded = await downloadVideo(body.url!);
        if (downloaded) {
          const { media, meta } = await prepareVideoForWhatsApp(downloaded);
          content = { video: media, caption: body.caption, mimetype: "video/mp4", ...meta };
        } else {
          content = { video: { url: body.url! }, caption: body.caption };
        }
      }
      break;
    }
  }

  if (body.type === "text" || body.type === "image" || body.type === "video") {
    Object.assign(content, await buildMentions(meta.socket, body.to, body));
  }

  // Mark chat as read before sending
  try {
    await meta.socket.chatModify({ markRead: true, lastMessages: [] }, body.to);
  } catch {}

  const result = await meta.socket.sendMessage(
    body.to,
    content as Parameters<typeof meta.socket.sendMessage>[1],
    quotedOption(body.to, body.quoted as Parameters<typeof quotedOption>[1])
  );
  const ts = result?.messageTimestamp;
  const timestamp = !ts ? null : typeof ts === "number" ? ts : Number(ts.toString());
  return { messageId: result?.key?.id, status: "sent", timestamp };
}

router.post("/send", async (req: Request, res: Response) => {
  const body = sendSchema.parse(req.body);
  try {
    const result = await sendSingleMessage(req.params.instanceId, body);
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

router.post("/sendBulk", async (req: Request, res: Response) => {
  const { messages, delayMs } = z.object({
    messages: z.array(sendSchema).min(1).max(100),
    delayMs: z.number().min(0).max(10_000).default(1000),
  }).parse(req.body);

  const results = [];
  for (const msg of messages) {
    try {
      const result = await sendSingleMessage(req.params.instanceId, msg);
      results.push({ ...result, to: msg.to });
    } catch (err: unknown) {
      results.push({ error: err instanceof Error ? err.message : "Send failed", to: msg.to });
    }
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  res.json({ results });
});

// React to a message with an emoji (an empty emoji removes the reaction).
// Handy for progress: 👀 when a request is picked up, ✅ / ❌ when it's done.
router.post("/react", async (req: Request, res: Response) => {
  const body = z.object({
    to: jidSchema,
    messageId: z.string().min(1),
    participant: z.string().optional(),
    fromMe: z.boolean().optional(),
    emoji: z.string().max(16),
  }).parse(req.body);

  const meta = sessionManager.getSession(req.params.instanceId);
  if (!meta || meta.status !== "connected") {
    return res.status(400).json({ error: "Instance not connected" });
  }
  const key = { remoteJid: body.to, id: body.messageId, fromMe: body.fromMe ?? false, ...(body.participant ? { participant: body.participant } : {}) };
  try {
    const result = await meta.socket.sendMessage(body.to, { react: { text: body.emoji, key } });
    res.json({ messageId: result?.key?.id, status: "sent" });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Reaction failed" });
  }
});

// Download the file from a received message. Send back `message` from the
// message.received webhook, or `enriched.quoted.message` for the file someone
// replied to. Botsab decrypts it and returns the raw bytes; nothing is stored.
const MAX_MEDIA_DOWNLOAD_BYTES = 100 * 1024 * 1024;
router.post("/media", async (req: Request, res: Response) => {
  const body = z.object({
    message: z.object({
      key: z.object({
        remoteJid: z.string().min(1),
        id: z.string().min(1),
        participant: z.string().optional().nullable(),
        fromMe: z.boolean().optional().nullable(),
      }).passthrough(),
      message: z.record(z.any()),
    }).passthrough(),
  }).parse(req.body);

  const meta = sessionManager.getSession(req.params.instanceId);
  if (!meta || meta.status !== "connected") {
    return res.status(400).json({ error: "Instance not connected" });
  }

  const content = body.message.message as proto.IMessage;
  try {
    assertDownloadableMedia(content);
  } catch (err: unknown) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Not a media message" });
  }
  const info = describeMedia(content)!;
  if (info.size && info.size > MAX_MEDIA_DOWNLOAD_BYTES) {
    return res.status(413).json({ error: "File is larger than 100 MB" });
  }

  try {
    const buffer = await downloadMediaMessage(
      body.message as Parameters<typeof downloadMediaMessage>[0],
      "buffer",
      {},
      // Old media is no longer on WhatsApp's servers; ask the sender's phone to re-upload it
      { logger: pino({ level: "silent" }), reuploadRequest: meta.socket.updateMediaMessage }
    );
    const fileName = (info.fileName ?? `${info.type}-${body.message.key.id}`).replace(/[^\w.\- ]+/g, "_");
    res.setHeader("Content-Type", info.mimetype ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("X-Media-Type", info.type);
    res.send(buffer);
  } catch (err: unknown) {
    res.status(502).json({
      error: `Could not download media: ${err instanceof Error ? err.message : "unknown error"}. It may have expired on WhatsApp's servers.`,
    });
  }
});

router.post("/read", async (req: Request, res: Response) => {
  const { keys } = z.object({
    keys: z.array(z.object({ remoteJid: z.string(), id: z.string(), fromMe: z.boolean() })).min(1),
  }).parse(req.body);

  const meta = sessionManager.getSession(req.params.instanceId);
  if (!meta || meta.status !== "connected") {
    return res.status(400).json({ error: "Instance not connected" });
  }

  await meta.socket.readMessages(keys);
  res.json({ success: true });
});

export default router;
