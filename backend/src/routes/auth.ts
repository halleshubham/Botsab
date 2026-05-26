import { Router, Request, Response } from "express";
import { z } from "zod";
import { registerUser, loginUser } from "../auth/service";
import { requireApiKey } from "../auth/middleware";
import { db } from "../db";

const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credentialsSchema.extend({
  plan: z.enum(["starter", "pro", "business"]).default("starter"),
  phone: z.string().min(7).max(20).optional(),
});

router.post("/register", async (req: Request, res: Response) => {
  const { email, password, plan, phone } = registerSchema.parse(req.body);
  try {
    const result = await registerUser(email, password, plan, phone);
    res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(409).json({ error: message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = credentialsSchema.parse(req.body);
  try {
    const result = await loginUser(email, password);
    res.json(result); // { userId, role }
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
