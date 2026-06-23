import { Router, Request, Response } from "express";
import { z } from "zod";
import https from "https";
import path from "path";
import { SocksProxyAgent } from "socks-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { requireApiKey, requireInstanceOwner } from "../auth/middleware.js";
import { db } from "../db/index.js";
import { sessionManager } from "../sessions/manager.js";
import { config } from "../config.js";

const router = Router();

router.use(requireApiKey);

router.get("/", async (req: Request, res: Response) => {
  const instances = await db("instances")
    .where({ user_id: req.userId })
    .select("id", "slug", "phone_number", "status", "proxy_url", "created_at")
    .orderBy("created_at", "desc");

  res.json(instances.map((i) => ({
    id: i.id,
    slug: i.slug,
    phoneNumber: i.phone_number,
    status: i.status,
    proxyUrl: i.proxy_url ?? null,
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

router.post("/:instanceId/proxy/test", requireInstanceOwner, async (req: Request, res: Response) => {
  let bodyUrl: string | undefined;
  try {
    ({ url: bodyUrl } = z.object({ url: z.string().url().optional() }).parse(req.body));
  } catch {
    return res.status(400).json({ error: "Invalid proxy URL format" });
  }

  const instance = await db("instances")
    .where({ id: req.params.instanceId, user_id: req.userId })
    .select("proxy_url")
    .first();
  if (!instance) return res.status(404).json({ error: "Instance not found" });

  const proxyUrl = bodyUrl ?? instance.proxy_url;
  if (!proxyUrl) return res.status(400).json({ error: "No proxy URL provided or configured" });

  let agent: https.Agent;
  try {
    agent = (proxyUrl.startsWith("socks")
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl)) as unknown as https.Agent;
  } catch {
    return res.status(400).json({ error: "Invalid proxy URL format" });
  }

  try {
    const ip = await new Promise<string>((resolve, reject) => {
      const request = https.get("https://api.ipify.org?format=json", { agent }, (proxyRes) => {
        let data = "";
        proxyRes.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        proxyRes.on("end", () => {
          try { resolve((JSON.parse(data) as { ip: string }).ip); }
          catch { reject(new Error("Unexpected response from IP check service")); }
        });
      });
      request.on("error", reject);
      request.setTimeout(10_000, () => { request.destroy(); reject(new Error("Proxy connection timed out")); });
    });
    res.json({ success: true, ip, proxy: proxyUrl.replace(/:[^@]+@/, ":***@") });
  } catch (err: unknown) {
    res.status(502).json({ success: false, error: (err as Error).message ?? "Proxy test failed" });
  }
});

router.patch("/:instanceId/proxy", requireInstanceOwner, async (req: Request, res: Response) => {
  let url: string | null;
  try {
    ({ url } = z.object({ url: z.string().url().nullable() }).parse(req.body));
  } catch {
    return res.status(400).json({ error: "Invalid proxy URL format" });
  }

  await db("instances")
    .where({ id: req.params.instanceId, user_id: req.userId })
    .update({ proxy_url: url });

  res.json({ proxyUrl: url });
});

router.delete("/:instanceId", requireInstanceOwner, async (req: Request, res: Response) => {
  await sessionManager.destroySession(req.params.instanceId, true);
  await db("instances").where({ id: req.params.instanceId }).delete();
  res.status(204).send();
});

export default router;
