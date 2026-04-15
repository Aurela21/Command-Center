import ffmpeg from "fluent-ffmpeg";
import { pipeline } from "stream/promises";
import { createWriteStream, existsSync } from "fs";
import { unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// Allow overriding binary paths via env (useful if not in PATH)
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

export type VideoMetadata = {
  durationMs: number;
  fps: number;
  totalFrames: number;
  width: number;
  height: number;
};

function parseRate(rate: string | undefined): number {
  if (!rate) return 30;
  const [num, den] = rate.split("/").map(Number);
  return den && den > 0 ? num / den : num || 30;
}

/** Probe a video URL or path and return metadata. Fast — reads only headers. */
export function probeVideo(input: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(input, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === "video");
      if (!v) return reject(new Error("No video stream found"));

      const duration = data.format.duration ?? 0;
      const fps = parseRate(v.r_frame_rate ?? v.avg_frame_rate);
      const totalFrames = v.nb_frames
        ? parseInt(v.nb_frames, 10)
        : Math.round(duration * fps);

      resolve({
        durationMs: Math.round(duration * 1000),
        fps: Math.round(fps * 100) / 100,
        totalFrames,
        width: v.width ?? 0,
        height: v.height ?? 0,
      });
    });
  });
}

/** Download a URL to a local temp file. Returns the temp path. */
export async function downloadToTemp(
  url: string,
  filename: string
): Promise<string> {
  const dir = path.join(tmpdir(), "cmd-center");
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, filename);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  if (!res.body) throw new Error("Response has no body");

  // Cast ReadableStream<Uint8Array> → Node stream
  const { Readable } = await import("stream");
  const nodeReadable = Readable.fromWeb(
    res.body as import("stream/web").ReadableStream
  );
  await pipeline(nodeReadable, createWriteStream(dest));
  return dest;
}

/**
 * Extract one JPEG thumbnail per second from a local video file.
 * Returns the list of generated file paths.
 */
export function extractThumbnails(
  inputPath: string,
  outputDir: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .fps(1)
      .outputOptions(["-q:v 4", "-vf", "scale=320:-1"])
      .output(path.join(outputDir, "thumb_%04d.jpg"))
      .on("end", () => {
        // Collect generated files
        const { readdirSync } = require("fs") as typeof import("fs");
        const files = readdirSync(outputDir)
          .filter((f: string) => f.startsWith("thumb_") && f.endsWith(".jpg"))
          .sort()
          .map((f: string) => path.join(outputDir, f));
        resolve(files);
      })
      .on("error", reject)
      .run();
  });
}

/**
 * Extract JPEG thumbnails at a given fps from a local video file.
 * Returns the list of generated file paths.
 */
export function extractFramesAtFps(
  inputPath: string,
  outputDir: string,
  fps: number
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .fps(fps)
      .outputOptions(["-q:v 4", "-vf", `scale=320:-1`])
      .output(path.join(outputDir, "frame_%06d.jpg"))
      .on("end", () => {
        const { readdirSync } = require("fs") as typeof import("fs");
        const files = readdirSync(outputDir)
          .filter((f: string) => f.startsWith("frame_") && f.endsWith(".jpg"))
          .sort()
          .map((f: string) => path.join(outputDir, f));
        resolve(files);
      })
      .on("error", reject)
      .run();
  });
}

/** Delete a temp file, silently ignoring errors. */
export async function cleanupTemp(filePath: string): Promise<void> {
  if (existsSync(filePath)) await unlink(filePath).catch(() => {});
}
