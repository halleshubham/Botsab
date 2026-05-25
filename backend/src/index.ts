import express from "express";
import rateLimit from "express-rate-limit";
import fs from "fs/promises";
import { config } from "./config";
import { db } from "./db";
import { sessionManager } from "./sessions/manager";
import { errorHandler } from "./utils/errors";
import { logger } from "./utils/logger";

import authRouter from "./routes/auth";
import keysRouter from "./routes/keys";
import instancesRouter from "./routes/instances";
import connectRouter from "./routes/connect";
import messagesRouter from "./routes/messages";
import groupsRouter from "./routes/groups";
import webhooksRouter from "./routes/webhooks";
import adminRouter from "./routes/admin";
import contactListsRouter from "./routes/contactLists";
import groupListsRouter from "./routes/groupLists";
import campaignsRouter from "./routes/campaigns";

const app = express();

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

app.use("/auth", authRouter);
app.use("/keys", keysRouter);
app.use("/instances", instancesRouter);
app.use("/instances/:instanceId", connectRouter);
app.use("/instances/:instanceId/messages", messagesRouter);
app.use("/instances/:instanceId/groups", groupsRouter);
app.use("/instances/:instanceId/webhook", webhooksRouter);
app.use("/instances/:instanceId/campaigns", campaignsRouter);
app.use("/contact-lists", contactListsRouter);
app.use("/group-lists", groupListsRouter);
app.use("/admin", adminRouter);

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

app.listen(config.port, async () => {
  await db.migrate.latest();
  await restoreActiveSessions();
  logger.info({ port: config.port }, "Botsab API running");
});

export default app;
