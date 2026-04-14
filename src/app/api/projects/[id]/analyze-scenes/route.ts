/**
 * POST /api/projects/[id]/analyze-scenes
 *
 * Downloads the reference video, extracts one frame per 2 seconds,
 * uploads frames to R2, sends them to Claude for scene detection,
 * then stores the detected scenes in the DB.
 *
 * Called by process-video after metadata is stored.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { presignedGet, uploadBuffer } from "@/lib/r2";
import { downloadToTemp, extractThumbnails, cleanupTemp } from "@/lib/video";
import { readFileSync } from "fs";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — frame extraction + Claude can be slow

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.referenceVideoUrl) {
    return NextResponse.json({ error: "No reference video" }, { status: 400 });
  }

  const durationMs = project.referenceVideoDurationMs ?? 30000;
  const fps = project.referenceFps ?? 30;
  const totalFrames = project.totalFrames ?? Math.round((durationMs / 1000) * fps);

  let tmpVideoPath: string | null = null;
  const tmpFrameDir = path.join(tmpdir(), `frames-${projectId}-${Date.now()}`);

  try {
    // 1. Download video to temp
    const downloadUrl = await presignedGet(project.referenceVideoUrl, 7200);
    const ext = path.extname(project.referenceVideoUrl) || ".mp4";
    tmpVideoPath = await downloadToTemp(downloadUrl, `${projectId}_ref${ext}`);

    // 2. Extract one frame per 2 seconds (capped at 20 frames)
    await import("fs/promises").then((m) => m.mkdir(tmpFrameDir, { recursive: true }));
    const framePaths = await extractThumbnails(tmpVideoPath, tmpFrameDir);
    const selectedPaths = framePaths.slice(0, 20);

    // 3. Upload frames to R2 and build content array for Claude
    const frameEntries: Array<{ timeS: number; frameNumber: number; r2Url: string }> = [];
    const claudeImages: Anthropic.ImageBlockParam[] = [];

    for (let i = 0; i < selectedPaths.length; i++) {
      const frameBuffer = readFileSync(selectedPaths[i]);
      const timeS = i; // extractThumbnails uses 1fps — one frame per second
      const frameNumber = Math.round(timeS * fps);
      const r2Key = `frames/${projectId}/f${String(i).padStart(4, "0")}.jpg`;
      const r2Url = await uploadBuffer(r2Key, frameBuffer, "image/jpeg");

      frameEntries.push({ timeS, frameNumber, r2Url });
      claudeImages.push({
        type: "image",
        source: { type: "url", url: r2Url },
      });
    }

    // 4. Call Claude for scene detection
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const durationS = durationMs / 1000;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            ...claudeImages,
            {
              type: "text",
              text: `You are analyzing frames from a ${durationS.toFixed(1)}-second video ad at ${fps} fps (${totalFrames} total frames).

I'm showing you ${selectedPaths.length} frames, one extracted per second (frame 0 = 0s, frame 1 = 1s, etc.).

Identify the distinct scenes in this video. Aim for 6–12 scenes for a ${durationS.toFixed(0)}-second ad.
Each scene should represent a meaningful visual segment (shot change, subject change, or narrative beat).

For each scene:
- sceneOrder: sequential number starting at 1
- startFrame: first frame of the scene (integer)
- endFrame: last frame of the scene (integer, exclusive end)
- startTimeMs: start time in milliseconds
- endTimeMs: end time in milliseconds
- referenceFrame: the single most representative frame number within this scene
- description: 1–2 sentence description of what happens visually and narratively
- klingPrompt: A precise Kling video generation prompt (max 35 words) that would recreate THIS EXACT clip segment. You MUST study the actual frames within this scene's boundaries and describe the SPECIFIC physical actions happening frame-by-frame:
  * What is the subject's body DOING? (hands zipping, arms extending, head turning, body rotating, walking forward, jumping, crouching, pulling fabric, etc.)
  * What CAMERA MOVEMENT is happening? (static, slow pan left, tilt up, dolly in, handheld shake, etc.)
  * What is the PACE/RHYTHM? (slow deliberate motion, quick snappy cuts, smooth continuous, etc.)
  DO NOT write generic prompts like "model showcases hoodie" — write exactly what you SEE happening: "Model's right hand pulls zipper down to mid-chest, left hand holds fabric open, camera slowly dollies in from waist to chest level"
- targetClipDurationS: how long this clip should be in the final output (3.0–10.0, must match scene duration)

IMPORTANT: scenes must be contiguous and cover the full video (0 to ${totalFrames} frames / ${durationMs}ms).

Return ONLY valid JSON with this exact shape:
{
  "scenes": [
    {
      "sceneOrder": 1,
      "startFrame": 0,
      "endFrame": 90,
      "startTimeMs": 0,
      "endTimeMs": 3000,
      "referenceFrame": 45,
      "description": "Person models cream hoodie, showing front zipper and overall fit",
      "klingPrompt": "Model's right hand grips zipper pull, draws it down to mid-chest in one smooth motion, left hand holds hem, static medium shot, subtle body sway side to side",
      "targetClipDurationS": 3.0
    }
  ]
}

Frame reference: each image corresponds to frame ${frameEntries.map((f, i) => `${i + 1}→f${f.frameNumber}(${f.timeS}s)`).join(", ")}.`,
            },
          ],
        },
      ],
    });

    const rawText =
      msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Claude returned no JSON for scene detection");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      scenes: Array<{
        sceneOrder: number;
        startFrame: number;
        endFrame: number;
        startTimeMs: number;
        endTimeMs: number;
        referenceFrame: number;
        description: string;
        klingPrompt?: string;
        targetClipDurationS: number;
      }>;
    };

    // 5. Delete existing scenes for this project and insert new ones
    await db.delete(scenes).where(eq(scenes.projectId, projectId));

    const sceneValues = parsed.scenes.map((s) => {
      // Find the extracted frame closest to the scene's reference frame
      const refEntry =
        frameEntries.length > 0
          ? frameEntries.reduce((best, entry) =>
              Math.abs(entry.frameNumber - s.referenceFrame) <
              Math.abs(best.frameNumber - s.referenceFrame)
                ? entry
                : best
            )
          : null;
      return {
        projectId,
        sceneOrder: s.sceneOrder,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        referenceFrame: s.referenceFrame,
        referenceFrameUrl: refEntry?.r2Url ?? null,
        description: s.description,
        scenePrompt: s.klingPrompt ?? null,
        targetClipDurationS: Math.min(Math.max(s.targetClipDurationS, 3.0), 15.0),
        boundarySource: "ai" as const,
      };
    });

    await db.insert(scenes).values(sceneValues);

    // 6. Advance project to manifest_review
    await db
      .update(projects)
      .set({ status: "manifest_review", updatedAt: sql`NOW()` })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ scenesCreated: parsed.scenes.length });
  } finally {
    // Clean up temp files
    if (tmpVideoPath) await cleanupTemp(tmpVideoPath);
    await rm(tmpFrameDir, { recursive: true, force: true }).catch(() => {});
  }
}
