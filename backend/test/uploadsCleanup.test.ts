import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs against a real Postgres (DATABASE_URL); skipped when none is configured
const skip = !process.env.DATABASE_URL && "DATABASE_URL not set";

const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "botsab-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;
process.env.UPLOADS_RETENTION_DAYS = "7";

// Imported after the env is set - config reads it at import time
const { db } = await import("../src/db/index.js");
const { cleanupOldUploads } = await import("../src/services/uploadsCleanup.js");

before(async () => {
  if (skip) return;
  await db.migrate.latest();
});

after(async () => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  await db.destroy();
});

test("deletes old uploads but keeps new files and files unfinished campaigns need", { skip }, async () => {
  const userId = crypto.randomUUID();
  const instanceId = `inst-${userId.slice(0, 8)}`;
  const listId = crypto.randomUUID();
  await db("users").insert({ id: userId, email: `${userId}@example.com`, password_hash: "x" });
  await db("instances").insert({ id: instanceId, user_id: userId, slug: instanceId, sessions_dir: "/tmp/none" });
  await db("contact_lists").insert({ id: listId, user_id: userId, name: "L" });
  const campaign = (status: string, fileId: string) =>
    db("bulk_campaigns").insert({
      id: crypto.randomUUID(), user_id: userId, instance_id: instanceId, list_type: "contact", list_id: listId,
      message_payload: JSON.stringify({ type: "video", fileId }), options: "{}", status,
      total_count: 0, sent_count: 0, failed_count: 0, skipped_count: 0,
    });
  await campaign("running", "old-running.mp4");
  await campaign("waiting", "old-waiting.jpg");
  await campaign("completed", "old-completed.mp4");

  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
  const files = ["old-running.mp4", "old-waiting.jpg", "old-completed.mp4", "old-unused.png", "new-file.mp4"];
  for (const f of files) {
    fs.writeFileSync(path.join(uploadsDir, f), "x");
    if (f.startsWith("old")) fs.utimesSync(path.join(uploadsDir, f), eightDaysAgo, eightDaysAgo);
  }
  fs.mkdirSync(path.join(uploadsDir, "subdir"));
  fs.utimesSync(path.join(uploadsDir, "subdir"), eightDaysAgo, eightDaysAgo);

  await cleanupOldUploads();

  const exists = (f: string) => fs.existsSync(path.join(uploadsDir, f));
  assert.ok(exists("old-running.mp4"), "kept: running campaign needs it");
  assert.ok(exists("old-waiting.jpg"), "kept: waiting campaign needs it");
  assert.ok(!exists("old-completed.mp4"), "deleted: campaign finished");
  assert.ok(!exists("old-unused.png"), "deleted: unreferenced and old");
  assert.ok(exists("new-file.mp4"), "kept: under 7 days old");
  assert.ok(exists("subdir"), "kept: directories are never touched");
});
