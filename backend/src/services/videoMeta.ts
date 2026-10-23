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

interface ProbeResult extends VideoMeta {
  videoCodec?: string;
  profile?: string;
  pixFmt?: string;
  audioCodec?: string;
  bitRate?: number;
  container?: string;
}

function run(cmd: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, out, stderr) =>
      err ? reject(new Error(`${err.message}${stderr ? `: ${String(stderr).slice(-300)}` : ""}`)) : resolve(out)
    );
  });
}

async function withTempFile<T>(input: Buffer | string, fn: (filePath: string) => Promise<T>): Promise<T> {
  if (typeof input === "string") return fn(input);
  const tmpPath = path.join(os.tmpdir(), `video-${crypto.randomUUID()}`);
  await fs.writeFile(tmpPath, input);
  try {
    return await fn(tmpPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function probe(filePath: string): Promise<ProbeResult> {
  const stdout = await run(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,codec_name,profile,pix_fmt,width,height:format=duration,bit_rate,format_name", "-of", "json", filePath],
    15_000
  );
  const parsed = JSON.parse(stdout) as {
    streams?: { codec_type?: string; codec_name?: string; profile?: string; pix_fmt?: string; width?: number; height?: number }[];
    format?: { duration?: string; bit_rate?: string; format_name?: string };
  };
  const video = parsed.streams?.find((s) => s.codec_type === "video") ?? {};
  const audio = parsed.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(parsed.format?.duration);
  const bitRate = Number(parsed.format?.bit_rate);
  return {
    seconds: Number.isFinite(duration) ? Math.max(1, Math.round(duration)) : undefined,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    profile: video.profile,
    pixFmt: video.pix_fmt,
    audioCodec: audio?.codec_name,
    bitRate: Number.isFinite(bitRate) ? bitRate : undefined,
    container: parsed.format?.format_name,
  };
}

const metaOf = ({ seconds, width, height }: ProbeResult): VideoMeta => ({ seconds, width, height });

// Baileys sends videos without duration or dimensions (it only computes
// those for audio/images), so WhatsApp renders a blank, image-like bubble
// showing just the file size. ffprobe (installed with ffmpeg in the image)
// fills them in; any failure just means sending without them, as before.
export async function probeVideo(input: Buffer | string): Promise<VideoMeta> {
  try {
    return metaOf(await withTempFile(input, probe));
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : err }, "ffprobe failed, sending video without metadata");
    return {};
  }
}

// WhatsApp clients only reliably decode H.264 in yuv420p (Baseline/Main/High
// profiles) with AAC audio. Anything else - HEVC, VP9, High 4:4:4 / High 10
// profiles, yuv444p, Opus audio - arrives as a video that won't play or
// download, and very high bitrates make huge files for a chat message.
function whyIncompatible(p: ProbeResult): string | null {
  // ffprobe reports MP4 and MOV alike as "mov,mp4,m4a,..."; MKV/WebM/AVI need remuxing
  if (p.container && !p.container.includes("mp4")) return `container ${p.container}`;
  if (p.videoCodec && p.videoCodec !== "h264") return `codec ${p.videoCodec}`;
  if (p.pixFmt && p.pixFmt !== "yuv420p") return `pixel format ${p.pixFmt}`;
  if (p.profile && !/^(constrained baseline|baseline|main|high)$/i.test(p.profile)) return `profile ${p.profile}`;
  if (p.audioCodec && p.audioCodec !== "aac") return `audio ${p.audioCodec}`;
  if (p.bitRate && p.bitRate > 8_000_000) return `bitrate ${Math.round(p.bitRate / 1e6)} Mbit/s`;
  return null;
}

const TRANSCODE_ARGS = [
  "-c:v", "libx264", "-preset", "veryfast",
  "-pix_fmt", "yuv420p", "-profile:v", "main", "-level", "4.0",
  "-b:v", "4M", "-maxrate", "5M", "-bufsize", "8M",
  // Keep dimensions even - yuv420p requires it
  "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
  "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
  "-movflags", "+faststart",
];

/**
 * Returns a WhatsApp-playable video plus its duration/dimensions. Compatible
 * files go out untouched; anything else is re-encoded to H.264 Main/yuv420p
 * + AAC. If probing or transcoding fails, the original bytes are returned so
 * a send is never blocked by this step.
 */
export async function prepareVideoForWhatsApp(input: Buffer | string): Promise<{ media: Buffer; meta: VideoMeta }> {
  const original = typeof input === "string" ? await fs.readFile(input) : input;
  return withTempFile(input, async (filePath) => {
    let info: ProbeResult;
    try {
      info = await probe(filePath);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, "ffprobe failed, sending video as-is");
      return { media: original, meta: {} };
    }

    const reason = whyIncompatible(info);
    if (!reason) return { media: original, meta: metaOf(info) };

    const outPath = path.join(os.tmpdir(), `video-${crypto.randomUUID()}.mp4`);
    try {
      const started = Date.now();
      await run("ffmpeg", ["-v", "error", "-y", "-i", filePath, ...TRANSCODE_ARGS, outPath], 300_000);
      const media = await fs.readFile(outPath);
      logger.info(
        { reason, ms: Date.now() - started, inBytes: original.length, outBytes: media.length },
        "Re-encoded video for WhatsApp compatibility"
      );
      let meta = metaOf(info);
      try { meta = metaOf(await probe(outPath)); } catch { /* keep source metadata */ }
      return { media, meta };
    } catch (err) {
      logger.warn({ reason, err: err instanceof Error ? err.message : err }, "Video re-encode failed, sending original");
      return { media: original, meta: metaOf(info) };
    } finally {
      await fs.unlink(outPath).catch(() => {});
    }
  });
}
