/**
 * Kling AI — official API client
 *
 * Auth: JWT signed with KLING_ACCESS_KEY + KLING_SECRET_KEY (HMAC-SHA256)
 * Base URL: https://api.klingai.com
 *
 * Flow: submitKlingJob → returns external task ID → cron calls pollKlingJob every 15s
 */

import { createHmac } from "crypto";

const BASE_URL = "https://api.klingai.com";

export type KlingSubmitRequest = {
  imageUrl: string;        // seed image (R2 presigned URL or public URL)
  prompt: string;          // unified scene prompt (≤ 40 words recommended)
  elementTags?: string[];  // Kling element reference names
  durationSeconds: number; // 3–15
  mode?: "std" | "pro";
};

export type KlingJobResult = {
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs: number;
};

// ─── Internal API types ──────────────────────────────────────────────────────

type KlingApiStatus = "pending" | "processing" | "succeed" | "failed";

interface KlingTaskResponse {
  code: number;
  message: string;
  data: {
    task_id: string;
    task_status: KlingApiStatus;
    task_status_msg?: string;
    task_result?: {
      videos?: Array<{
        id: string;
        url: string;
        duration: string; // seconds as string
      }>;
    };
  };
}

// ─── JWT generation ──────────────────────────────────────────────────────────

function base64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeJwt(): string {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error("KLING_ACCESS_KEY and KLING_SECRET_KEY must be set");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })
  );
  const sig = base64url(
    createHmac("sha256", secretKey)
      .update(`${header}.${payload}`)
      .digest()
  );
  return `${header}.${payload}.${sig}`;
}

// ─── HTTP client ─────────────────────────────────────────────────────────────

async function klingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${makeJwt()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = await res.json();
  if (!res.ok || body.code !== 0) {
    throw new Error(
      `Kling API ${res.status}: ${body.message ?? JSON.stringify(body)}`
    );
  }
  return body;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Submit a new video generation task. Returns the external task ID. */
export async function submitKlingJob(req: KlingSubmitRequest): Promise<string> {
  const body: Record<string, unknown> = {
    image: req.imageUrl,
    prompt: req.prompt,
    duration: String(req.durationSeconds),
    mode: req.mode ?? "std",
  };

  if (req.elementTags?.length) {
    body.elements = req.elementTags;
  }

  const res = await klingFetch<KlingTaskResponse>("/v1/videos/image2video", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return res.data.task_id;
}

/**
 * Poll an in-flight Kling job.
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

  let res: KlingTaskResponse;
  try {
    res = await klingFetch<KlingTaskResponse>(
      `/v1/videos/image2video/${externalJobId}`
    );
  } catch (err) {
    console.error(`[kling] Poll fetch error for ${externalJobId}:`, err);
    return; // transient error — try again next tick
  }

  const { task_status, task_result } = res.data;

  if (task_status === "succeed") {
    const video = task_result?.videos?.[0];
    if (!video) {
      await failJob(internalJobId, "Kling succeeded but returned no video");
      return;
    }

    const [job] = await db.select().from(jobs).where(eq(jobs.id, internalJobId));
    if (!job?.sceneId) {
      await failJob(internalJobId, "Job has no sceneId");
      return;
    }

    const durationMs = Math.round(parseFloat(video.duration) * 1000);

    // Download from Kling and upload to R2
    const { downloadAndUpload } = await import("./r2");
    const key = `kling-videos/${job.sceneId}/${Date.now()}.mp4`;
    const fileUrl = await downloadAndUpload(video.url, key, "video/mp4");

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
        durationMs,
        generationPrompt: (job.resultData as Record<string, unknown>)?.prompt as string ?? null,
      })
      .returning();

    await completeJob(internalJobId, { file_url: fileUrl }, av.id);
  } else if (task_status === "failed") {
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
        res.data.task_status_msg ?? "Kling generation failed"
      );
    }
  } else {
    // pending | processing
    const progress = task_status === "processing" ? 50 : 10;
    await updateJobProgress(internalJobId, progress, undefined, task_status);
  }
}
