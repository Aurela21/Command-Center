/**
 * Kling 3.0 — Higgs Field API client
 *
 * Docs: https://docs.klingai.com  (update BASE_URL via KLING_API_BASE_URL env var)
 * Auth: Bearer token via KLING_API_KEY
 *
 * Flow: submitKlingJob → returns external job ID → cron calls pollKlingJob every 15s
 */

export type KlingSubmitRequest = {
  imageUrl: string; // seed image (R2 presigned URL or public URL)
  prompt: string; // unified scene prompt (≤ 40 words recommended)
  elementTags?: string[]; // Kling element reference names
  durationSeconds: number; // 3–15
  mode?: "standard" | "pro";
};

export type KlingJobResult = {
  videoUrl: string;
  thumbnailUrl?: string;
  durationMs: number;
};

// ─── Internal API types ──────────────────────────────────────────────────────

type KlingApiStatus =
  | "pending"
  | "processing"
  | "succeed"
  | "failed";

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
    process_info?: {
      process_status?: string;
    };
  };
}

// ─── Client ──────────────────────────────────────────────────────────────────

function baseUrl() {
  return (
    process.env.KLING_API_BASE_URL?.replace(/\/$/, "") ??
    "https://api.klingai.com"
  );
}

async function klingFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.KLING_API_KEY}`,
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
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: String(req.durationSeconds),
    mode: req.mode ?? "standard",
  };

  if (req.elementTags?.length) {
    body.elements = req.elementTags;
  }

  const res = await klingFetch<KlingTaskResponse>(
    "/v1/videos/image2video",
    { method: "POST", body: JSON.stringify(body) }
  );

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
  const { jobs } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  let res: KlingTaskResponse;
  try {
    res = await klingFetch<KlingTaskResponse>(
      `/v1/videos/image2video/${externalJobId}`
    );
  } catch (err) {
    console.error(
      `[kling] Poll fetch error for ${externalJobId}:`,
      err
    );
    return; // transient error — try again next tick
  }

  const { task_status, task_result } = res.data;

  if (task_status === "succeed") {
    const video = task_result?.videos?.[0];
    if (!video) {
      await failJob(internalJobId, "Kling succeeded but returned no video");
      return;
    }
    // TODO (Step 3C): download video from video.url, upload to R2, create asset_version
    await completeJob(internalJobId, {
      video_url: video.url,
      external_id: video.id,
      duration_ms: Math.round(parseFloat(video.duration) * 1000),
    });
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
    // pending | processing — update progress estimate (Kling doesn't expose %)
    const progress = task_status === "processing" ? 50 : 10;
    await updateJobProgress(internalJobId, progress, undefined, task_status);
  }
}
