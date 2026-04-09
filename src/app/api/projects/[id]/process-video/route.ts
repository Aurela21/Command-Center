import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { presignedGet } from "@/lib/r2";
import { probeVideo, downloadToTemp, cleanupTemp } from "@/lib/video";
import path from "path";
import { tmpdir } from "os";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { key } = await req.json();

  if (!key || typeof key !== "string") {
    return NextResponse.json(
      { error: "key is required" },
      { status: 400 }
    );
  }

  // Persist the R2 key and flip status immediately so the client can poll
  await db
    .update(projects)
    .set({
      referenceVideoUrl: key,
      status: "analyzing",
      updatedAt: sql`NOW()`,
    })
    .where(eq(projects.id, id));

  // Fire-and-forget — Railway runs a persistent Node process, so this completes
  setImmediate(() => {
    runVideoProcessing(id, key).catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[process-video] project ${id} failed: ${msg}`);
      // Revert status so the user can retry
      await db
        .update(projects)
        .set({ status: "uploading", updatedAt: sql`NOW()` })
        .where(eq(projects.id, id));
    });
  });

  return NextResponse.json({ status: "analyzing" });
}

async function runVideoProcessing(projectId: string, key: string) {
  // 1. Generate a presigned GET URL (2 hour window — long enough for large videos)
  const downloadUrl = await presignedGet(key, 7200);

  // 2. Try probing directly over HTTPS first (fast for metadata-only)
  let metadata;
  let tmpPath: string | null = null;

  try {
    metadata = await probeVideo(downloadUrl);
  } catch {
    // Fallback: download to temp and probe locally
    console.log(
      `[process-video] Remote probe failed for ${projectId}, downloading…`
    );
    const ext = path.extname(key) || ".mp4";
    tmpPath = path.join(tmpdir(), `${projectId}_ref${ext}`);
    await downloadToTemp(downloadUrl, tmpPath);
    metadata = await probeVideo(tmpPath);
  }

  const durationS = metadata.durationMs / 1000;
  console.log(
    `[process-video] ${projectId}: ${durationS.toFixed(2)}s, ` +
      `${metadata.fps}fps, ${metadata.totalFrames} frames, ` +
      `${metadata.width}×${metadata.height}`
  );

  // 3. Persist metadata and advance to manifest_review
  await db
    .update(projects)
    .set({
      referenceVideoDurationMs: metadata.durationMs,
      referenceFps: metadata.fps,
      totalFrames: metadata.totalFrames,
      status: "manifest_review",
      updatedAt: sql`NOW()`,
    })
    .where(eq(projects.id, projectId));

  if (tmpPath) await cleanupTemp(tmpPath);
}
