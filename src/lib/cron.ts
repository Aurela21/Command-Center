import cron from "node-cron";
import { getActiveJobs, getStalledJobs, failJob, retryJob } from "./job-queue";
import type { Job } from "@/db/schema";

let started = false;

export function startCronPoller(): void {
  if (started) return;
  started = true;

  console.log("[cron] Starting job poller — 15s interval");

  // Run every 15 seconds: "*/15 * * * * *" (second-level cron)
  cron.schedule("*/15 * * * * *", async () => {
    try {
      await tick();
    } catch (err) {
      console.error("[cron] Uncaught tick error:", err);
    }
  });
}

async function tick(): Promise<void> {
  // ── 1. Detect and handle stalled jobs ────────────────────────────────────
  const stalled = await getStalledJobs();
  for (const job of stalled) {
    const attempts = job.attemptCount ?? 0;
    const max = job.maxAttempts ?? 3;

    if (attempts < max) {
      console.log(
        `[cron] Stalled: ${job.id} (${job.jobType}) — requeueing attempt ${attempts + 1}/${max}`
      );
      await retryJob(job.id);
    } else {
      console.log(
        `[cron] Stalled: ${job.id} (${job.jobType}) — max attempts reached`
      );
      await failJob(job.id, "Stalled: no updates for 10 minutes");
    }
  }

  // ── 2. Poll active external jobs ─────────────────────────────────────────
  const active = await getActiveJobs();
  if (active.length === 0) return;

  console.log(`[cron] Polling ${active.length} active job(s)`);

  // Process in parallel — each poller is idempotent
  await Promise.allSettled(active.map(processJob));
}

async function processJob(job: Job): Promise<void> {
  try {
    switch (job.jobType) {
      case "kling_generation": {
        if (!job.externalJobId) return;
        const { pollKlingJob } = await import("./kling");
        await pollKlingJob(job.id, job.externalJobId);
        break;
      }
      case "nano_banana": {
        if (!job.externalJobId) return;
        const { pollNanoBananaJob } = await import("./nano-banana");
        await pollNanoBananaJob(job.id, job.externalJobId);
        break;
      }
      // video_analysis and frame_analysis are one-shot (triggered by API routes,
      // not by the poller) — nothing to poll here
      default:
        break;
    }
  } catch (err) {
    console.error(`[cron] processJob error for ${job.id}:`, err);
  }
}

// Re-export for testing
export { tick as _tickForTesting };
