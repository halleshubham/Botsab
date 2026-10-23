import fs from "fs/promises";
import path from "path";
import { db } from "../db/index.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // hourly

// Campaigns that may still read their uploaded file (bulkSender loads it at start)
const ACTIVE_CAMPAIGN_STATUSES = ["pending", "queued", "running", "waiting"];

/**
 * Deletes files in the uploads dir older than UPLOADS_RETENTION_DAYS. Uploads
 * are only read while a send is being prepared, so old files are just disk
 * use - except ones an unfinished campaign still points at, which are kept
 * regardless of age.
 */
export async function cleanupOldUploads(): Promise<void> {
  const cutoff = Date.now() - config.uploadsRetentionDays * 24 * 60 * 60 * 1000;

  const active: { fileId: string }[] = await db("bulk_campaigns")
    .whereIn("status", ACTIVE_CAMPAIGN_STATUSES)
    .whereRaw("message_payload->>'fileId' is not null")
    .select(db.raw("message_payload->>'fileId' as \"fileId\""));
  const keep = new Set(active.map((r) => path.basename(r.fileId)));

  const entries = await fs.readdir(config.uploadsDir, { withFileTypes: true });
  let deleted = 0;
  let freedBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || keep.has(entry.name)) continue;
    const filePath = path.join(config.uploadsDir, entry.name);
    try {
      const { mtimeMs, size } = await fs.stat(filePath);
      if (mtimeMs >= cutoff) continue;
      await fs.unlink(filePath);
      deleted++;
      freedBytes += size;
    } catch (err) {
      logger.warn({ file: entry.name, err: err instanceof Error ? err.message : err }, "Could not remove old upload");
    }
  }

  if (deleted > 0) {
    logger.info(
      { deleted, freedMB: Math.round(freedBytes / 1024 / 1024), retentionDays: config.uploadsRetentionDays },
      "Removed old uploads"
    );
  }
}

export function startUploadsCleanup(): void {
  if (config.uploadsRetentionDays <= 0) {
    logger.info("Uploads cleanup disabled (UPLOADS_RETENTION_DAYS <= 0)");
    return;
  }
  const run = () =>
    cleanupOldUploads().catch((err) =>
      logger.error({ err: err instanceof Error ? err.message : err }, "Uploads cleanup failed")
    );
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}
