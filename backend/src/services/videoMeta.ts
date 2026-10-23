import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { logger } from "../utils/logger.js";

export interface VideoMeta {
  seconds?: number;
  width?: number;
  height?: number;
}

// Baileys sends videos without duration or dimensions (it only computes
// those for audio/images), so WhatsApp renders a blank, image-like bubble
// showing just the file size. ffprobe (installed with ffmpeg in the image)
// fills them in; any failure just means sending without them, as before.
export async function probeVideo(input: Buffer | string): Promise<VideoMeta> {
  let tmpPath: string | null = null;
  try {
    let filePath: string;
    if (typeof input === "string") {
      filePath = input;
    } else {
      tmpPath = path.join(os.tmpdir(), `probe-${crypto.randomUUID()}`);
      await fs.writeFile(tmpPath, input);
      filePath = tmpPath;
    }

    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "ffprobe",
        ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", filePath],
        { timeout: 15_000 },
        (err, out) => (err ? reject(err) : resolve(out))
      );
    });

    const parsed = JSON.parse(stdout) as {
      streams?: { width?: number; height?: number }[];
      format?: { duration?: string };
    };
    const stream = parsed.streams?.[0] ?? {};
    const duration = Number(parsed.format?.duration);
    return {
      seconds: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : undefined,
      width: stream.width,
      height: stream.height,
    };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "ffprobe failed, sending video without metadata");
    return {};
  } finally {
    if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
  }
}
