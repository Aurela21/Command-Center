import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { presignedGet } from "@/lib/r2";
import { probeVideo, downloadToTemp, cleanupTemp } from "@/lib/video";
import path from "path";

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

  // Fire-and-forget — runs metadata probe then scene analysis
  setImmediate(() => {
    runVideoProcessing(id, key).catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[process-video] project ${id} failed: ${msg}`);
      await db
        .update(projects)
        .set({ status: "uploading", updatedAt: sql`NOW()` })
        .where(eq(projects.id, id));
    });
  });

  return NextResponse.json({ status: "analyzing" });
}

async function runVideoProcessing(projectId: string, key: string) {
  // 1. Generate a presigned GET URL
  const downloadUrl = await presignedGet(key, 7200);

  // 2. Probe metadata
  let metadata;
  let tmpPath: string | null = null;

  try {
    metadata = await probeVideo(downloadUrl);
  } catch {
    console.log(
      `[process-video] Remote probe failed for ${projectId}, downloading…`
    );
    const ext = path.extname(key) || ".mp4";
    tmpPath = await downloadToTemp(downloadUrl, `${projectId}_ref${ext}`);
    metadata = await probeVideo(tmpPath);
  }

  console.log(
    `[process-video] ${projectId}: ${(metadata.durationMs / 1000).toFixed(2)}s, ` +
    `${metadata.fps}fps, ${metadata.totalFrames} frames`
  );

  // 3. Persist metadata (keep status = "analyzing" — scene detection is next)
  await db
    .update(projects)
    .set({
      referenceVideoDurationMs: metadata.durationMs,
      referenceFps: metadata.fps,
      totalFrames: metadata.totalFrames,
      updatedAt: sql`NOW()`,
    })
    .where(eq(projects.id, projectId));

  if (tmpPath) await cleanupTemp(tmpPath);

  // 4. Trigger scene analysis (downloads video again, extracts frames, calls Claude)
  console.log(`[process-video] Starting scene analysis for ${projectId}…`);

  const origin = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const analyzeRes = await fetch(`${origin}/api/projects/${projectId}/analyze-scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!analyzeRes.ok) {
    const text = await analyzeRes.text();
    throw new Error(`analyze-scenes failed: ${text}`);
  }

  const { scenesCreated } = await analyzeRes.json() as { scenesCreated: number };
  console.log(`[process-video] Scene analysis complete: ${scenesCreated} scenes for ${projectId}`);
}
