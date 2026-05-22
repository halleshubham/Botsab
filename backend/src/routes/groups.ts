import { Router, Request, Response } from "express";
import { z } from "zod";
import type { GroupMetadata } from "@whiskeysockets/baileys";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { sessionManager } from "../sessions/manager";

const router = Router({ mergeParams: true });

router.use(requireApiKey);
router.use(requireInstanceOwner);

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
    }))
  );
});

router.get("/:groupId", async (req: Request, res: Response) => {
  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;
  try {
    const metadata = await meta.socket.groupMetadata(req.params.groupId);
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
    z.object({ type: z.literal("image"), url: z.string().url(), caption: z.string().optional() }),
    z.object({ type: z.literal("document"), url: z.string().url(), filename: z.string(), mimetype: z.string() }),
    z.object({ type: z.literal("video"), url: z.string().url(), caption: z.string().optional() }),
  ]).parse(req.body);

  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;

  const jid = req.params.groupId.endsWith("@g.us")
    ? req.params.groupId
    : `${req.params.groupId}@g.us`;

  let content: Record<string, unknown>;
  switch (body.type) {
    case "text":     content = { text: body.text }; break;
    case "image":    content = { image: { url: body.url }, caption: body.caption }; break;
    case "document": content = { document: { url: body.url }, fileName: body.filename, mimetype: body.mimetype }; break;
    case "video":    content = { video: { url: body.url }, caption: body.caption }; break;
  }

  try {
    const result = await meta.socket.sendMessage(jid, content as Parameters<typeof meta.socket.sendMessage>[1]);
    const ts = result?.messageTimestamp;
    const timestamp = !ts ? null : typeof ts === "number" ? ts : Number(ts.toString());
    res.json({ messageId: result?.key?.id, groupId: jid, status: "sent", timestamp });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Send failed" });
  }
});

router.post("/:groupId/participants", async (req: Request, res: Response) => {
  const { action, participants } = z.object({
    action: z.enum(["add", "remove", "promote", "demote"]),
    participants: z.array(z.string().regex(/^[^@]+@s\.whatsapp\.net$/)).min(1),
  }).parse(req.body);

  const meta = getConnectedSession(req.params.instanceId, res);
  if (!meta) return;

  const result = await meta.socket.groupParticipantsUpdate(req.params.groupId, participants, action);
  res.json({ result });
});

export default router;
