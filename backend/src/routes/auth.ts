import { Router, Request, Response } from "express";
import { z } from "zod";
import { registerUser, loginUser } from "../auth/service.js";
import { requireApiKey } from "../auth/middleware.js";
import { db } from "../db/index.js";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const registerSchema = credentialsSchema.extend({
  plan: z.enum(["starter", "pro", "business"]).default("starter"),
  phone: z.string().min(7).max(20).optional(),
});

router.post("/register", async (req: Request, res: Response) => {
  const body = registerSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Validation error", details: body.error.errors });
  try {
    const result = await registerUser(body.data.email, body.data.password, body.data.plan, body.data.phone);
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(409).json({ error: message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const body = credentialsSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid credentials" });
  try {
    const result = await loginUser(body.data.email, body.data.password);
    res.json(result);
  } catch {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

router.post("/logout", requireApiKey, async (req: Request, res: Response) => {
  await db("api_keys").where({ id: req.keyId }).update({ revoked: true });
  res.json({ ok: true });
});

router.get("/me", requireApiKey, async (req: Request, res: Response) => {
  const user = await db("users")
    .where({ id: req.userId })
    .select("id", "email", "role", "instance_limit", "status", "plan", "phone")
    .first();
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    userId: user.id,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    instanceLimit: Number(user.instance_limit),
    status: user.status ?? "active",
    plan: user.plan ?? "starter",
  });
});

export default router;
