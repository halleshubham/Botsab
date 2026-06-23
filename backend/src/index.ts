import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { sessionManager } from "./sessions/manager.js";
import { errorHandler } from "./utils/errors.js";
import { logger } from "./utils/logger.js";
import { requireApiKey } from "./auth/middleware.js";

import authRouter from "./routes/auth.js";
import keysRouter from "./routes/keys.js";
import instancesRouter from "./routes/instances.js";
import connectRouter from "./routes/connect.js";
import messagesRouter from "./routes/messages.js";
import groupsRouter from "./routes/groups.js";
import webhooksRouter from "./routes/webhooks.js";
import adminRouter from "./routes/admin.js";
import contactListsRouter from "./routes/contactLists.js";
import groupListsRouter from "./routes/groupLists.js";
import campaignsRouter from "./routes/campaigns.js";
import phoneContactsRouter from "./routes/phoneContacts.js";
import mediaRouter from "./routes/media.js";
import oauthRouter from "./routes/oauth.js";
import mcpRouter from "./mcp/router.js";

const app = express();

app.set("trust proxy", 1);

// Ensure uploads directory exists
fsSync.mkdirSync(config.uploadsDir, { recursive: true });

app.use(express.json({ limit: "10mb" }));

app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    keyGenerator: (req) =>
      (req.headers["x-api-key"] as string) ||
      req.headers.authorization?.replace("Bearer ", "") ||
      req.ip ||
      "unknown",
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.ip || "unknown",
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
});

// OAuth 2.0 endpoints (no auth — includes /.well-known discovery)
app.use(oauthRouter);
// MCP endpoint (dual auth: OAuth Bearer or x-api-key)
app.use("/mcp", mcpRouter);

app.use("/auth", authLimiter, authRouter);
app.use("/keys", keysRouter);
app.use("/instances", instancesRouter);
app.use("/instances/:instanceId", connectRouter);
app.use("/instances/:instanceId/messages", messagesRouter);
app.use("/instances/:instanceId/groups", groupsRouter);
app.use("/instances/:instanceId/webhook", webhooksRouter);
app.use("/instances/:instanceId/campaigns", campaignsRouter);
app.use("/instances/:instanceId/phone-contacts", phoneContactsRouter);
app.use("/contact-lists", contactListsRouter);
app.use("/group-lists", groupListsRouter);
app.use("/admin", adminRouter);
app.use("/media", mediaRouter);

app.get("/uploads/:filename", requireApiKey, (req, res) => {
  const filename = path.basename(req.params.filename);
  res.sendFile(filename, { root: path.resolve(config.uploadsDir) }, (err) => {
    if (err) res.status(404).json({ error: "File not found" });
  });
});

app.get("/public/config", (_req, res) => {
  res.json({ contactEmail: config.superadminEmail });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(errorHandler);

async function restoreActiveSessions() {
  const instances = await db("instances")
    .whereIn("status", ["connected", "qr_pending"])
    .select("id", "user_id", "sessions_dir");

  for (const inst of instances) {
    const dirExists = await fs
      .access(inst.sessions_dir)
      .then(() => true)
      .catch(() => false);

    if (!dirExists) {
      await db("instances").where({ id: inst.id }).update({ status: "disconnected" });
      continue;
    }

    sessionManager.createSession(inst.user_id, inst.id).catch((err: Error) => {
      logger.error({ instanceId: inst.id, err: err.message }, "Failed to restore session");
    });
  }
}

async function cleanupStaleCampaigns() {
  // Campaigns stuck in "running" were interrupted mid-flight (server crash/restart).
  // Campaigns stuck in "queued" lost their in-memory queue slot.
  // Mark both terminal so users can restart them explicitly.
  const [running, queued] = await Promise.all([
    db("bulk_campaigns").whereIn("status", ["running"]).update({ status: "failed",    completed_at: new Date() }),
    db("bulk_campaigns").where({ status: "queued" })  .update({ status: "cancelled", completed_at: new Date() }),
  ]);
  if (running || queued) {
    logger.info({ running, queued }, "Cleaned up stale campaigns from previous run");
  }
}

app.listen(config.port, async () => {
  await db.migrate.latest();
  await cleanupStaleCampaigns();
  await restoreActiveSessions();
  logger.info({ port: config.port }, "Botsab API running");
});

export default app;
