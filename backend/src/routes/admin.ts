import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireApiKey, requireSuperadmin } from "../auth/middleware";
import { db } from "../db";

const router = Router();

router.use(requireApiKey);
router.use(requireSuperadmin);

router.get("/users", async (_req: Request, res: Response) => {
  const users = await db("users")
    .select("id", "email", "role", "instance_limit", "created_at")
    .orderBy("created_at", "asc");

  const counts = await db("instances")
    .select("user_id")
    .count("id as c")
    .groupBy("user_id");

  const countMap = Object.fromEntries(counts.map((r) => [r.user_id, Number(r.c)]));

  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      instanceLimit: Number(u.instance_limit),
      instanceCount: countMap[u.id] ?? 0,
      createdAt: u.created_at,
    }))
  );
});

router.patch("/users/:userId", async (req: Request, res: Response) => {
  const { instanceLimit, role } = z.object({
    instanceLimit: z.number().int().min(-1).optional(),
    role: z.enum(["user", "superadmin"]).optional(),
  }).parse(req.body);

  if (instanceLimit === undefined && role === undefined) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const target = await db("users").where({ id: req.params.userId }).first();
  if (!target) return res.status(404).json({ error: "User not found" });

  const update: Record<string, unknown> = {};
  if (instanceLimit !== undefined) update.instance_limit = instanceLimit;
  if (role !== undefined) update.role = role;

  const [updated] = await db("users")
    .where({ id: req.params.userId })
    .update(update)
    .returning(["id", "email", "role", "instance_limit"]);

  res.json({
    id: updated.id,
    email: updated.email,
    role: updated.role,
    instanceLimit: Number(updated.instance_limit),
  });
});

export default router;
