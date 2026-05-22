import { Router, Request, Response } from "express";
import { z } from "zod";
import path from "path";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware";
import { db } from "../db";
import { sessionManager } from "../sessions/manager";
import { config } from "../config";

const router = Router();

router.use(requireApiKey);

router.get("/", async (req: Request, res: Response) => {
  const instances = await db("instances")
    .where({ user_id: req.userId })
    .select("id", "slug", "phone_number", "status", "created_at")
    .orderBy("created_at", "desc");

  res.json(instances.map((i) => ({
    id: i.id,
    slug: i.slug,
    phoneNumber: i.phone_number,
    status: i.status,
    createdAt: i.created_at,
  })));
});

router.post("/", async (req: Request, res: Response) => {
  const { slug } = z
    .object({ slug: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, "slug must be lowercase alphanumeric") })
    .parse(req.body);

  const user = await db("users").where({ id: req.userId }).select("role", "instance_limit").first();
  if (!user) return res.status(401).json({ error: "User not found" });

  if (user.role !== "superadmin") {
    const limit = Number(user.instance_limit);
    if (limit <= 0) {
      return res.status(403).json({ error: "Instance creation not allowed. Contact your administrator." });
    }
    const count = await db("instances").where({ user_id: req.userId }).count("id as c").first();
    if (Number(count?.c ?? 0) >= limit) {
      return res.status(403).json({ error: `Instance limit reached (${limit}). Contact your administrator to increase it.` });
    }
  }

  const existing = await db("instances").where({ user_id: req.userId, slug }).first();
  if (existing) return res.status(409).json({ error: "Slug already in use" });

  const instanceId = `${req.userId.replace(/-/g, "").slice(0, 8)}_${slug}`;
  const sessionsDir = path.resolve(config.sessionsDir, instanceId);

  await db("instances").insert({
    id: instanceId,
    user_id: req.userId,
    slug,
    sessions_dir: sessionsDir,
    status: "disconnected",
    webhook_events: JSON.stringify([]),
  });

  res.status(201).json({ id: instanceId, slug, status: "disconnected", sessionsDir });
});

router.delete("/:instanceId", requireInstanceOwner, async (req: Request, res: Response) => {
  await sessionManager.destroySession(req.params.instanceId, true);
  await db("instances").where({ id: req.params.instanceId }).delete();
  res.status(204).send();
});

export default router;
