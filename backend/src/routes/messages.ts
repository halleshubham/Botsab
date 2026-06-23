import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { sessionManager } from "../sessions/manager.js";
import { config } from "../config.js";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

const jidSchema = z.string().regex(/^[^@]+@(s\.whatsapp\.net|g\.us)$/, "Invalid JID format");

const sendSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), to: jidSchema, text: z.string().min(1) }),
  z.object({ type: z.literal("image"), to: jidSchema, url: z.string().url().optional(), fileId: z.string().optional(), caption: z.string().optional() }),
  z.object({ type: z.literal("document"), to: jidSchema, url: z.string().url(), filename: z.string(), mimetype: z.string() }),
  z.object({ type: z.literal("audio"), to: jidSchema, url: z.string().url(), ptt: z.boolean().optional() }),
  z.object({ type: z.literal("video"), to: jidSchema, url: z.string().url(), caption: z.string().optional() }),
]);

async function sendSingleMessage(instanceId: string, body: z.infer<typeof sendSchema>) {
  const meta = sessionManager.getSession(instanceId);
  if (!meta || meta.status !== "connected") throw new Error("Instance not connected");

  if (body.type === "image" && !body.url && !body.fileId) {
    throw new Error("Either url or fileId is required for image");
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
    case "video":   content = { video: { url: body.url }, caption: body.caption }; break;
  }

  // Mark chat as read before sending
  try {
    await meta.socket.chatModify({ markRead: true, lastMessages: [] }, body.to);
  } catch {}

  const result = await meta.socket.sendMessage(
    body.to,
    content as Parameters<typeof meta.socket.sendMessage>[1]
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
