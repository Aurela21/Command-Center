/**
 * Nano Banana Pro — seed image generation client
 *
 * Flow: submitNanoBananaJob → returns job ID → cron calls pollNanoBananaJob
 * One output image per request. 30–90s generation time.
 */

export type NanoBananaRequest = {
  imageUrl: string; // reference frame (presigned or public R2 URL)
  prompt: string; // change prompt describing what to generate
};

export type NanoBananaResult = {
  outputUrl: string;
};

// ─── Internal API types ──────────────────────────────────────────────────────

type NBStatus = "pending" | "processing" | "completed" | "failed";

interface NBJobResponse {
  id: string;
  status: NBStatus;
  output?: { url: string };
  error?: string;
}

// ─── Client ──────────────────────────────────────────────────────────────────

function baseUrl() {
  return (
    process.env.NANO_BANANA_API_BASE_URL?.replace(/\/$/, "") ??
    "https://api.nanobanana.pro"
  );
}

async function nbFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NANO_BANANA_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nano Banana ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Submit a new seed image generation job. Returns the external job ID. */
export async function submitNanoBananaJob(
  req: NanoBananaRequest
): Promise<string> {
  const data = await nbFetch<NBJobResponse>("/v1/generate", {
    method: "POST",
    body: JSON.stringify({
      image_url: req.imageUrl,
      prompt: req.prompt,
    }),
  });
  return data.id;
}

/**
 * Poll an in-flight Nano Banana job.
 * Called by the cron poller every 15 seconds for all active nano_banana jobs.
 */
export async function pollNanoBananaJob(
  internalJobId: string,
  externalJobId: string
): Promise<void> {
  const { updateJobProgress, completeJob, failJob, retryJob } = await import(
    "./job-queue"
  );
  const { db } = await import("@/db");
  const { jobs } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  let data: NBJobResponse;
  try {
    data = await nbFetch<NBJobResponse>(`/v1/jobs/${externalJobId}`);
  } catch (err) {
    console.error(
      `[nano-banana] Poll fetch error for ${externalJobId}:`,
      err
    );
    return; // transient — retry next tick
  }

  if (data.status === "completed" && data.output?.url) {
    // TODO (Step 3A): download output from data.output.url, upload to R2,
    // create asset_version record, run quality check
    await completeJob(internalJobId, { output_url: data.output.url });
  } else if (data.status === "failed") {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, internalJobId));

    const attempts = job?.attemptCount ?? 0;
    const max = job?.maxAttempts ?? 3;

    if (attempts < max) {
      await retryJob(internalJobId);
    } else {
      await failJob(internalJobId, data.error ?? "Nano Banana generation failed");
    }
  } else {
    // pending | processing
    const progress = data.status === "processing" ? 50 : 10;
    await updateJobProgress(internalJobId, progress, undefined, data.status);
  }
}
