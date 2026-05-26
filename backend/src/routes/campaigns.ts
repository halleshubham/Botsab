import { Router, Request, Response } from "express";
import { z } from "zod";

import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { db } from "../db";
import { sessionManager } from "../sessions/manager";
import { runCampaign, cancelCampaign, DEFAULT_OPTIONS, MAX_RECIPIENTS_HARD_CAP } from "../services/bulkSender";
import { logger } from "../utils/logger";

const router = Router({ mergeParams: true });
router.use(requireApiKey);
router.use(requireInstanceOwner);

const messagePayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(4096) }),
  z.object({
    type: z.literal("image"),
    url: z.string().url().optional(),
    fileId: z.string().optional(),
    mimeType: z.string().optional(),
    caption: z.string().max(1024).optional(),
  }),
  z.object({
    type: z.literal("document"),
    url: z.string().url(),
    filename: z.string(),
    mimetype: z.string(),
  }),
  z.object({
    type: z.literal("video"),
    url: z.string().url(),
    caption: z.string().max(1024).optional(),
  }),
]);

const optionsSchema = z
  .object({
    minDelayMs: z.number().int().min(1000).max(30000),
    maxDelayMs: z.number().int().min(1000).max(120000),
    batchSize: z.number().int().min(1).max(50),
    batchPauseMs: z.number().int().min(10000).max(600000),
    shuffle: z.boolean(),
    appendSuffix: z.boolean(),
    suffixType: z.enum(["invisible", "hex"]),
    suffixLength: z.number().int().min(1).max(8),
    sendTypingIndicator: z.boolean(),
    markReadBeforeSend: z.boolean(),
    maxRecipients: z.number().int().min(1).max(MAX_RECIPIENTS_HARD_CAP),
  })
  .partial()
  .optional();

router.get("/", async (req: Request, res: Response) => {
  const campaigns = await db("bulk_campaigns")
    .where({ instance_id: req.params.instanceId, user_id: req.userId })
    .orderBy("created_at", "desc")
    .limit(100)
    .select(
      "id",
      "list_type",
      "list_id",
      "message_payload",
      "options",
      "status",
      "total_count",
      "sent_count",
      "failed_count",
      "skipped_count",
      "created_at",
      "started_at",
      "completed_at"
    );
  res.json(campaigns);
});

router.get("/:campaignId", async (req: Request, res: Response) => {
  const campaign = await db("bulk_campaigns")
    .where({
      id: req.params.campaignId,
      instance_id: req.params.instanceId,
      user_id: req.userId,
    })
    .first();
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  const results = await db("bulk_campaign_results")
    .where({ campaign_id: req.params.campaignId })
    .orderBy("sent_at", "asc")
    .select("recipient", "status", "error", "sent_at");

  res.json({ ...campaign, results });
});

router.post("/", async (req: Request, res: Response) => {
  let body: z.infer<ReturnType<typeof z.object>>;
  try {
    body = z
      .object({
        list_type: z.enum(["contact", "group"]),
        list_id: z.string().uuid(),
        message: messagePayloadSchema,
        options: optionsSchema,
      })
      .parse(req.body);
  } catch (err) {
    return res.status(400).json({ error: err instanceof z.ZodError ? err.errors : "Invalid request body" });
  }

  if (body.message.type === "image" && !body.message.url && !body.message.fileId) {
    return res.status(400).json({ error: "Image campaign requires either url or fileId" });
  }

  const listTable = body.list_type === "contact" ? "contact_lists" : "group_lists";
  const list = await db(listTable).where({ id: body.list_id, user_id: req.userId }).first();
  if (!list) return res.status(404).json({ error: "List not found" });

  const meta = sessionManager.getSession(req.params.instanceId);
  if (!meta || meta.status !== "connected") {
    return res.status(400).json({ error: "Instance not connected" });
  }

  const options = { ...DEFAULT_OPTIONS, ...body.options };
  if (options.maxDelayMs <= options.minDelayMs) {
    return res.status(400).json({ error: "maxDelayMs must be greater than minDelayMs" });
  }

  const id = crypto.randomUUID();
  await db("bulk_campaigns").insert({
    id,
    user_id: req.userId,
    instance_id: req.params.instanceId,
    list_type: body.list_type,
    list_id: body.list_id,
    message_payload: JSON.stringify(body.message),
    options: JSON.stringify(options),
    status: "pending",
    total_count: 0,
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
  });

  runCampaign(id).catch((err) => {
    logger.error({ campaignId: id, err }, "Campaign runner threw");
    db("bulk_campaigns")
      .where({ id })
      .update({ status: "failed", completed_at: new Date() })
      .catch(() => {});
  });

  res.status(201).json({ id, status: "pending" });
});

router.post("/:campaignId/cancel", async (req: Request, res: Response) => {
  const campaign = await db("bulk_campaigns")
    .where({
      id: req.params.campaignId,
      instance_id: req.params.instanceId,
      user_id: req.userId,
    })
    .first();
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  if (!["pending", "running"].includes(campaign.status)) {
    return res.status(400).json({ error: "Campaign is not active" });
  }
  cancelCampaign(req.params.campaignId);
  res.json({ success: true, message: "Cancel signal sent; campaign will stop after current message" });
});

export default router;
