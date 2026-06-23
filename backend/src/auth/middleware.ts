import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../db/index.js";

declare global {
  namespace Express {
    interface Request {
      userId: string;
      keyId: string;
      userRole: string;
      instance?: Record<string, unknown>;
    }
  }
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const raw =
    (req.headers["x-api-key"] as string) ||
    req.headers.authorization?.replace("Bearer ", "") ||
    (req.query["x-api-key"] as string | undefined);

  if (!raw) {
    return res.status(401).json({ error: "API key required" });
  }

  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");

  const apiKey = await db("api_keys")
    .where({ key_hash: keyHash, revoked: false })
    .first();

  if (!apiKey) {
    return res.status(401).json({ error: "Invalid or revoked API key" });
  }

  db("api_keys")
    .where({ id: apiKey.id })
    .update({ last_used_at: new Date() })
    .catch(() => {});

  req.userId = apiKey.user_id;
  req.keyId = apiKey.id;

  const user = await db("users").where({ id: apiKey.user_id }).select("role", "status").first();
  req.userRole = user?.role ?? "user";

  if (user?.status !== "active") {
    return res.status(403).json({ error: "Account is inactive" });
  }

  next();
}

export async function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "superadmin") {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

export async function requireInstanceOwner(req: Request, res: Response, next: NextFunction) {
  const instance = await db("instances")
    .where({ id: req.params.instanceId, user_id: req.userId })
    .first();

  if (!instance) {
    return res.status(404).json({ error: "Instance not found" });
  }

  req.instance = instance;
  next();
}
