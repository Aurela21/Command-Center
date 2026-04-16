/**
 * Kling video generation — via Higgsfield Platform API
 *
 * Model: kling-video/v2.1/pro/image-to-video
 * Auth: Key {HF_API_KEY}:{HF_API_SECRET}
 * Flow: submitKlingJob → returns request_id → cron calls pollKlingJob every 15s
 */

import { submitRequest, pollRequest } from "./higgsfield";

const KLING_MODEL = "kling-video/v3.0/pro/image-to-video";

export type KlingSubmitRequest = {
  imageUrl: string; // seed image (R2 public URL) — start frame
  prompt: string; // unified scene prompt
  elementTags?: string[]; // Kling element reference names
  durationSeconds: number; // 5 or 10
  mode?: "std" | "pro";
  tailImageUrl?: string; // optional end frame for start→end generation
};

export type KlingJobResult = {
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs: number;
};

// ─── Public API ──────────────────────────────────────────────────────────────

/** Submit a new video generation task via Higgsfield. Returns the request_id. */
export async function submitKlingJob(
  req: KlingSubmitRequest
): Promise<string> {
  const params: Record<string, unknown> = {
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: req.durationSeconds,
    aspect_ratio: "9:16",
    resolution: "720p",
  };
  if (req.tailImageUrl) {
    params.tail_image_url = req.tailImageUrl;
  }
  if (req.elementTags?.length) {
    params.element_tags = req.elementTags;
  }
  const res = await submitRequest(KLING_MODEL, params);
  return res.request_id;
}

/**
 * Poll an in-flight Kling job via Higgsfield.
 * Called by the cron poller every 15 seconds for all active kling_generation jobs.
 */
export async function pollKlingJob(
  internalJobId: string,
  externalJobId: string
): Promise<void> {
  const { updateJobProgress, completeJob, failJob, retryJob } = await import(
    "./job-queue"
  );
  const { db } = await import("@/db");
  const { jobs, assetVersions } = await import("@/db/schema");
  const { eq, and } = await import("drizzle-orm");

  let res;
  try {
    res = await pollRequest(externalJobId);
  } catch (err) {
    console.error(`[kling] Poll error for ${externalJobId}:`, err);
    return; // transient — try again next tick
  }

  if (res.status === "completed") {
    const videoUrl = res.video?.url;
    if (!videoUrl) {
      await failJob(
        internalJobId,
        "Higgsfield completed but returned no video URL"
      );
      return;
    }

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, internalJobId));
    if (!job?.sceneId) {
      await failJob(internalJobId, "Job has no sceneId");
      return;
    }

    // Download from Higgsfield and upload to R2
    const { downloadAndUpload } = await import("./r2");
    const key = `kling-videos/${job.sceneId}/${Date.now()}.mp4`;
    const fileUrl = await downloadAndUpload(videoUrl, key, "video/mp4");

    // Count existing Kling output versions for this scene
    const existing = await db
      .select({ id: assetVersions.id })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.sceneId, job.sceneId),
          eq(assetVersions.assetType, "kling_output")
        )
      );

    // Create asset_version record
    const [av] = await db
      .insert(assetVersions)
      .values({
        sceneId: job.sceneId,
        assetType: "kling_output",
        versionNumber: existing.length + 1,
        fileUrl,
        durationMs: 0,
        generationPrompt:
          ((job.resultData as Record<string, unknown>)?.prompt as string) ??
          null,
      })
      .returning();

    // Auto-score the generated video (non-blocking)
    try {
      const { scoreGeneration } = await import("./claude");
      const { qualityChecks } = await import("@/db/schema");
      const videoPrompt = ((job.resultData as Record<string, unknown>)?.prompt as string) ?? "";
      const score = await scoreGeneration({
        prompt: videoPrompt,
        outputUrl: fileUrl,
        durationS: job.etaSeconds ?? undefined,
      });
      await db
        .update(assetVersions)
        .set({ qualityScore: score as unknown as Record<string, unknown> })
        .where(eq(assetVersions.id, av.id));
      for (const [checkType, checkScore] of Object.entries(score.breakdown)) {
        await db.insert(qualityChecks).values({
          assetVersionId: av.id,
          checkType,
          score: checkScore as number,
        });
      }
    } catch (err) {
      console.warn("[kling] Auto-scoring failed:", err);
    }

    await completeJob(internalJobId, { file_url: fileUrl }, av.id);
  } else if (res.status === "failed") {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, internalJobId));

    const attempts = job?.attemptCount ?? 0;
    const max = job?.maxAttempts ?? 3;

    if (attempts < max) {
      await retryJob(internalJobId);
    } else {
      await failJob(
        internalJobId,
        res.error ?? "Kling generation failed"
      );
    }
  } else if (res.status === "nsfw") {
    await failJob(internalJobId, "Content failed moderation checks");
  } else {
    // queued | in_progress
    const progress = res.status === "in_progress" ? 50 : 10;
    await updateJobProgress(internalJobId, progress, undefined, res.status);
  }
}
