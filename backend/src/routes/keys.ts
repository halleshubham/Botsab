import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey } from "../auth/middleware.js";
import { createApiKey, revokeApiKey } from "../auth/service.js";
import { db } from "../db/index.js";

const router = Router();

router.use(requireApiKey);

router.get("/", async (req: Request, res: Response) => {
  const keys = await db("api_keys")
    .where({ user_id: req.userId, revoked: false })
    .select("id", "label", "last_used_at", "created_at")
    .orderBy("created_at", "desc");

  res.json(keys.map((k) => ({
    id: k.id,
    label: k.label,
    lastUsedAt: k.last_used_at,
    createdAt: k.created_at,
  })));
});

router.post("/", async (req: Request, res: Response) => {
  const { label } = z.object({ label: z.string().min(1).max(100) }).parse(req.body);
  const result = await createApiKey(req.userId, label);
  res.status(201).json(result);
});

router.delete("/:keyId", async (req: Request, res: Response) => {
  const revoked = await revokeApiKey(req.params.keyId, req.userId);
  if (!revoked) return res.status(404).json({ error: "Key not found" });
  res.status(204).send();
});

export default router;
