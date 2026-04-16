/**
 * POST /api/projects/[id]/analyze-scenes
 *
 * Downloads the reference video, extracts at 3fps (hard rule),
 * uploads ALL frames to R2, sends them all to Claude for scene detection
 * (Pass 1), then does per-scene motion analysis (Pass 2).
 *
 * Frame count is dynamic: 30s video → 90 frames, 90s video → 270 frames.
 * Called by process-video after metadata is stored.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { presignedGet, uploadBuffer } from "@/lib/r2";
import { downloadToTemp, extractThumbnails, extractFramesAtFps, cleanupTemp } from "@/lib/video";
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

  const FPS_EXTRACT = 3; // hard rule: 3 frames per second

  try {
    // 1. Download video to temp
    const downloadUrl = await presignedGet(project.referenceVideoUrl, 7200);
    const ext = path.extname(project.referenceVideoUrl) || ".mp4";
    tmpVideoPath = await downloadToTemp(downloadUrl, `${projectId}_ref${ext}`);

    // 2. Extract at 3fps — hard rule for motion understanding
    await import("fs/promises").then((m) => m.mkdir(tmpFrameDir, { recursive: true }));
    const allFramePaths = await extractFramesAtFps(tmpVideoPath, tmpFrameDir, FPS_EXTRACT);
    console.log(`[analyze-scenes] Extracted ${allFramePaths.length} frames at ${FPS_EXTRACT}fps`);

    // 3. Upload ALL 3fps frames to R2 (parallel, batched for backpressure)
    type FrameEntry = { index: number; timeS: number; frameNumber: number; r2Url: string };

    const UPLOAD_CONCURRENCY = 20;
    const allFrames: FrameEntry[] = new Array(allFramePaths.length);

    for (let batch = 0; batch < allFramePaths.length; batch += UPLOAD_CONCURRENCY) {
      const slice = allFramePaths.slice(batch, batch + UPLOAD_CONCURRENCY);
      await Promise.all(
        slice.map(async (framePath, j) => {
          const i = batch + j;
          const frameBuffer = readFileSync(framePath);
          const timeS = i / FPS_EXTRACT;
          const frameNumber = Math.round(timeS * fps);
          const r2Key = `frames/${projectId}/f${String(i).padStart(4, "0")}.jpg`;
          const r2Url = await uploadBuffer(r2Key, frameBuffer, "image/jpeg");
          allFrames[i] = { index: i, timeS, frameNumber, r2Url };
        })
      );
    }
    console.log(`[analyze-scenes] Uploaded ${allFrames.length} frames to R2`);

    // Store total extracted frame count on project
    await db
      .update(projects)
      .set({ totalFrames: allFrames.length, updatedAt: sql`NOW()` })
      .where(eq(projects.id, projectId));

    // 4. PASS 1: Scene boundary detection
    // Claude API limit: 100 images per request. Subsample evenly if needed.
    const MAX_PASS1_FRAMES = 95; // leave headroom under 100
    let detectionFrames: FrameEntry[];
    if (allFrames.length <= MAX_PASS1_FRAMES) {
      detectionFrames = allFrames;
    } else {
      const stride = allFrames.length / MAX_PASS1_FRAMES;
      detectionFrames = Array.from({ length: MAX_PASS1_FRAMES }, (_, i) =>
        allFrames[Math.min(Math.round(i * stride), allFrames.length - 1)]
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const durationS = durationMs / 1000;

    // Google Vision on ~1fps subset for structured context (cost management)
    let visionContext = "";
    try {
      const visionStride = Math.max(1, FPS_EXTRACT); // pick 1 frame per second
      const visionSubset = allFrames.filter((_, i) => i % visionStride === 0);
      const { analyzeImageBatch } = await import("@/lib/vision");
      const visionResults = await analyzeImageBatch(visionSubset.map((f) => f.r2Url));
      visionContext = "\n\n**Google Vision analysis per frame:**\n" +
        visionResults.map((v, i) => {
          const labels = v.labels.slice(0, 8).map((l) => l.description).join(", ");
          const objects = v.objects.slice(0, 6).map((o) => o.name).join(", ");
          return `Frame ${visionSubset[i].index} (${visionSubset[i].timeS.toFixed(1)}s): labels=[${labels}] objects=[${objects}]`;
        }).join("\n");
      console.log(`[analyze-scenes] Vision analysis complete (${visionSubset.length} frames)`);
    } catch (err) {
      console.warn("[analyze-scenes] Google Vision skipped:", err instanceof Error ? err.message : err);
    }

    const detectionImages: Anthropic.ImageBlockParam[] = detectionFrames.map((f) => ({
      type: "image",
      source: { type: "url", url: f.r2Url },
    }));

    const pass1 = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            ...detectionImages,
            {
              type: "text",
              text: `You are analyzing ${detectionFrames.length} frames from a ${durationS.toFixed(1)}-second video ad (${allFrames.length} total frames extracted at ${FPS_EXTRACT}fps${detectionFrames.length < allFrames.length ? `, evenly sampled to ${detectionFrames.length} for analysis` : ""}).

Use these frames to identify scene boundaries precisely.

Identify EVERY distinct scene — a scene is any meaningful visual segment (shot change, camera angle change, subject change, or narrative beat). Do NOT combine fast cuts into one scene. Each cut or transition is a new scene. ${durationS < 20 ? "Expect 4–10 scenes." : durationS < 45 ? "Expect 8–20 scenes." : durationS < 90 ? "Expect 15–30 scenes." : "Expect 20–40 scenes."} Use more scenes rather than fewer — the user can always merge scenes later, but missing a cut loses information.

For each scene return:
- sceneOrder, startFrame (index in the full ${FPS_EXTRACT}fps sequence, 0 to ${allFrames.length - 1}), endFrame, startTimeMs, endTimeMs
- referenceFrame: the most representative frame index (in the full sequence)
- description: 1–2 sentences of what happens
- targetClipDurationS: 3.0–10.0

Scenes must be contiguous and cover the full video (0 to ${allFrames.length - 1} frame indices / ${durationMs}ms).
Frame timing: index / ${FPS_EXTRACT} = seconds (e.g. frame 9 = 3.0s, frame 45 = 15.0s).
${detectionFrames.length < allFrames.length ? `\nThe ${detectionFrames.length} frames shown map to these indices in the full sequence: [${detectionFrames.map((f) => f.index).join(", ")}]\n` : ""}${visionContext}

Return ONLY valid JSON: { "scenes": [{ "sceneOrder": 1, "startFrame": 0, "endFrame": 12, "startTimeMs": 0, "endTimeMs": 4000, "referenceFrame": 6, "description": "...", "targetClipDurationS": 4.0 }] }`,
            },
          ],
        },
      ],
    });

    const pass1Text = pass1.content[0].type === "text" ? pass1.content[0].text : "";
    const pass1Json = pass1Text.match(/\{[\s\S]*\}/)?.[0];
    if (!pass1Json) throw new Error("Claude returned no JSON for scene detection");

    const detected = JSON.parse(pass1Json) as {
      scenes: Array<{
        sceneOrder: number;
        startFrame: number;
        endFrame: number;
        startTimeMs: number;
        endTimeMs: number;
        referenceFrame: number;
        description: string;
        targetClipDurationS: number;
      }>;
    };

    console.log(`[analyze-scenes] Pass 1: ${detected.scenes.length} scenes detected`);

    // 5. PASS 2: Per-scene motion analysis with 3fps frames (all scenes in parallel)
    const sceneResults = await Promise.all(
      detected.scenes.map(async (scene) => {
        const sceneFrames = allFrames.filter(
          (f) => f.index >= scene.startFrame && f.index < scene.endFrame
        ).slice(0, 15);

        if (sceneFrames.length === 0) {
          return { ...scene, klingPrompt: "" };
        }

        const sceneImages: Anthropic.ImageBlockParam[] = sceneFrames.map((f) => ({
          type: "image",
          source: { type: "url", url: f.r2Url },
        }));

        const pass2 = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: [
                ...sceneImages,
                {
                  type: "text",
                  text: `These ${sceneFrames.length} frames are from scene ${scene.sceneOrder} of a video ad (${((scene.endTimeMs - scene.startTimeMs) / 1000).toFixed(1)}s).
Scene description: ${scene.description}

Study the MOTION SEQUENCE across these frames. Write a precise Kling video generation prompt (max 35 words) that describes:
1. What the subject's body DOES frame by frame (specific hand/arm/body movements you can trace across the frames)
2. Camera movement (static, pan, tilt, dolly, etc.)
3. Pacing (slow/fast/smooth)

Rules:
- Do NOT describe background/environment/setting — the seed image handles that.
- Refer to the subject as "subject" or "model" — no demographics.
- Write EXACTLY what you see happening across the frames, not a generic description.

Return ONLY the prompt text, nothing else.`,
                },
              ],
            },
          ],
        });

        const klingPrompt = pass2.content[0].type === "text" ? pass2.content[0].text.trim() : "";
        console.log(`[analyze-scenes] Pass 2: Scene ${scene.sceneOrder} → "${klingPrompt.slice(0, 60)}…"`);
        return { ...scene, klingPrompt };
      })
    );

    // 6. Delete existing scenes and insert new ones
    await db.delete(scenes).where(eq(scenes.projectId, projectId));

    const sceneValues = sceneResults.map((s) => {
      const refFrame = allFrames.find((f) => f.index === s.referenceFrame) ?? allFrames[0];
      return {
        projectId,
        sceneOrder: s.sceneOrder,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        referenceFrame: s.referenceFrame,
        referenceFrameUrl: refFrame?.r2Url ?? null,
        description: s.description,
        scenePrompt: s.klingPrompt || null,
        targetClipDurationS: Math.min(Math.max(s.targetClipDurationS, 3.0), 15.0),
        boundarySource: "ai" as const,
      };
    });

    await db.insert(scenes).values(sceneValues);

    // 7. Advance project to manifest_review
    await db
      .update(projects)
      .set({ status: "manifest_review", updatedAt: sql`NOW()` })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ scenesCreated: sceneResults.length });
  } finally {
    if (tmpVideoPath) await cleanupTemp(tmpVideoPath);
    await rm(tmpFrameDir, { recursive: true, force: true }).catch(() => {});
  }
}
