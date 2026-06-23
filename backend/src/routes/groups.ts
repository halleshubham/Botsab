import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import { z } from "zod";
import type { GroupMetadata } from "@whiskeysockets/baileys";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { sessionManager } from "../sessions/manager.js";
import { config } from "../config.js";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

const GROUP_JID_RE = /^[\d-]{6,40}$/;

function resolveGroupJid(raw: string, res: Response): string | null {
  const base = raw.endsWith("@g.us") ? raw.slice(0, -5) : raw;
  if (!GROUP_JID_RE.test(base)) {
    res.status(400).json({ error: "Invalid group ID format" });
    return null;
  }
  return `${base}@g.us`;
}

function getConnectedSession(instanceId: string, res: Response) {
  const meta = sessionManager.getSession(instanceId);
  if (!meta || meta.status !== "connected") {
    res.status(400).json({ error: "Instance not connected" });
    return null;
  }
  return meta;
}

router.get("/", async (req: Request, res: Response) => {
  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;
  const groups = await meta.socket.groupFetchAllParticipating();
  res.json(
    (Object.values(groups) as GroupMetadata[]).map((g) => ({
      id: g.id,
      name: g.subject,
      description: g.desc ?? null,
      participantCount: g.participants.length,
      createdAt: g.creation ? new Date(g.creation * 1000).toISOString() : null,
      announce: g.announce ?? false,
    }))
  );
});

router.get("/:groupId", async (req: Request, res: Response) => {
  const jid = resolveGroupJid(req.params.groupId, res);
  if (!jid) return;
  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;
  try {
    const metadata = await meta.socket.groupMetadata(jid);
    res.json(metadata);
  } catch {
    res.status(404).json({ error: "Group not found" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  const { name, participants } = z.object({
    name: z.string().min(1).max(100),
    participants: z.array(z.string().regex(/^[^@]+@s\.whatsapp\.net$/)).min(1),
  }).parse(req.body);

  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;

  const result = await meta.socket.groupCreate(name, participants);
  res.status(201).json(result);
});

router.post("/:groupId/send", async (req: Request, res: Response) => {
  const body = z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string().min(1) }),
    z.object({ type: z.literal("image"), url: z.string().url().optional(), fileId: z.string().optional(), caption: z.string().optional() }),
    z.object({ type: z.literal("document"), url: z.string().url(), filename: z.string(), mimetype: z.string() }),
    z.object({ type: z.literal("video"), url: z.string().url(), caption: z.string().optional() }),
  ]).parse(req.body);

  if (body.type === "image" && !body.url && !body.fileId) {
    return res.status(400).json({ error: "Either url or fileId is required for image" });
  }

  const jid = resolveGroupJid(req.params.groupId, res);
  if (!jid) return;
  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;

  let content: Record<string, unknown> = {};
  switch (body.type) {
    case "text":     content = { text: body.text }; break;
    case "image": {
      if (body.fileId) {
        const filePath = path.resolve(config.uploadsDir, path.basename(body.fileId));
        if (!fs.existsSync(filePath)) {
          return res.status(400).json({ error: "File not found" });
        }
        content = { image: fs.readFileSync(filePath), caption: body.caption };
      } else {
        content = { image: { url: body.url! }, caption: body.caption };
      }
      break;
    }
    case "document": content = { document: { url: body.url }, fileName: body.filename, mimetype: body.mimetype }; break;
    case "video":    content = { video: { url: body.url }, caption: body.caption }; break;
  }

  // Mark chat as read before sending so the message appears after the bot has "seen" the conversation
  try {
    await meta.socket.chatModify({ markRead: true, lastMessages: [] }, jid);
  } catch {}

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await meta.socket.sendMessage(jid, content as Parameters<typeof meta.socket.sendMessage>[1]);
      const ts = result?.messageTimestamp;
      const timestamp = !ts ? null : typeof ts === "number" ? ts : Number(ts.toString());
      return res.json({ messageId: result?.key?.id, groupId: jid, status: "sent", timestamp });
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : "";
      if (msg === "No sessions" && attempt < 3) {
        await new Promise((r) => setTimeout(r, 3000 * attempt));
        continue;
      }
      break;
    }
  }
  res.status(400).json({ error: lastErr instanceof Error ? lastErr.message : "Send failed" });
});

router.post("/:groupId/participants", async (req: Request, res: Response) => {
  const { action, participants } = z.object({
    action: z.enum(["add", "remove", "promote", "demote"]),
    participants: z.array(z.string().regex(/^[^@]+@s\.whatsapp\.net$/)).min(1),
  }).parse(req.body);

  const jid = resolveGroupJid(req.params.groupId, res);
  if (!jid) return;
  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;

  const result = await meta.socket.groupParticipantsUpdate(jid, participants, action);
  res.json({ result });
});

export default router;
