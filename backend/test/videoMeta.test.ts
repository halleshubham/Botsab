import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadVideo, prepareVideoForWhatsApp, probeVideo } from "../src/services/videoMeta.js";

// Needs ffmpeg/ffprobe on PATH (installed in CI and in the production image)
let dir: string;
const ffmpeg = (...args: string[]) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...args]);
const streams = (file: string) =>
  execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,profile,pix_fmt,sample_rate", "-of", "csv=p=0", file])
    .toString()
    .trim();

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "botsab-video-"));
  const src = ["-f", "lavfi", "-i", "testsrc=duration=3:size=360x640:rate=24"];
  // Already WhatsApp-compatible: H.264 Main, yuv420p, AAC
  ffmpeg(...src, "-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "main", "-c:a", "aac", "-shortest", path.join(dir, "ok.mp4"));
  // What SocioBird's stitcher once produced: High 4:4:4 / yuv444p with 96 kHz audio
  ffmpeg(...src, "-f", "lavfi", "-i", "sine=duration=3:sample_rate=96000", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-c:a", "aac", "-ar", "96000", "-shortest", path.join(dir, "bad444.mp4"));
  ffmpeg(...src, "-f", "lavfi", "-i", "sine=duration=3", "-c:v", "libvpx-vp9", "-b:v", "300k", "-c:a", "libopus", "-shortest", path.join(dir, "clip.webm"));
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("probeVideo reads duration and dimensions", async () => {
  assert.deepEqual(await probeVideo(path.join(dir, "ok.mp4")), { seconds: 3, width: 360, height: 640 });
  assert.deepEqual(await probeVideo(Buffer.from("not a video")), {});
});

test("compatible videos are sent byte-for-byte unchanged", async () => {
  const file = path.join(dir, "ok.mp4");
  const { media, meta } = await prepareVideoForWhatsApp(file);
  assert.ok(media.equals(fs.readFileSync(file)));
  assert.equal(meta.width, 360);
});

for (const name of ["bad444.mp4", "clip.webm"]) {
  test(`${name} is re-encoded to H.264 Main / yuv420p + AAC`, async () => {
    const input = fs.readFileSync(path.join(dir, name));
    const { media, meta } = await prepareVideoForWhatsApp(input);
    assert.ok(!media.equals(input));
    const out = path.join(dir, `out-${name}.mp4`);
    fs.writeFileSync(out, media);
    const info = streams(out);
    assert.match(info, /h264,Main,yuv420p/);
    assert.match(info, /aac,LC,48000/);
    assert.deepEqual(meta, { seconds: 3, width: 360, height: 640 });
  });
}

test("a file that isn't a video is passed through, never blocking the send", async () => {
  const junk = Buffer.from("not a video");
  const { media, meta } = await prepareVideoForWhatsApp(junk);
  assert.ok(media.equals(junk));
  assert.deepEqual(meta, {});
});

test("downloadVideo: fetches public URLs and returns null for unsafe or failed ones", async (t) => {
  const file = fs.readFileSync(path.join(dir, "ok.mp4"));
  const fetched: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    fetched.push(url);
    if (url.includes("missing")) return new Response("nope", { status: 404 });
    if (url.includes("huge-declared")) return new Response("x", { headers: { "content-length": String(200 * 1024 * 1024) } });
    if (url.includes("huge-stream")) {
      let sent = 0;
      const chunk = new Uint8Array(8 * 1024 * 1024);
      return new Response(new ReadableStream({ pull(c) { if (sent >= 150 * 1024 * 1024) return c.close(); sent += chunk.length; c.enqueue(chunk); } }));
    }
    return new Response(file);
  });

  assert.equal((await downloadVideo("https://cdn.example.com/reel.mp4"))?.length, file.length);
  assert.equal(await downloadVideo("http://192.168.1.5/reel.mp4"), null);
  assert.ok(!fetched.includes("http://192.168.1.5/reel.mp4"), "private hosts must never be fetched");
  assert.equal(await downloadVideo("https://cdn.example.com/missing.mp4"), null);
  assert.equal(await downloadVideo("https://cdn.example.com/huge-declared.mp4"), null);
  assert.equal(await downloadVideo("https://cdn.example.com/huge-stream.mp4"), null);
});
