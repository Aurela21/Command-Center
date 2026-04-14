import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { emit } from "./event-bus";
import type { NewJob } from "@/db/schema";

type Job = typeof jobs.$inferSelect;

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createJob(
  input: Omit<NewJob, "id" | "createdAt" | "updatedAt">
): Promise<Job> {
  const [job] = await db.insert(jobs).values(input).returning();
  return job;
}

// ─── Status transitions ──────────────────────────────────────────────────────

export async function submitJob(
  jobId: string,
  externalJobId: string
): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      status: "submitted",
      externalJobId,
      startedAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();
  return job;
}

export async function updateJobProgress(
  jobId: string,
  progress: number,
  eta?: number,
  externalStatus?: string
): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      progressPct: progress,
      etaSeconds: eta ?? null,
      externalStatus: externalStatus ?? null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();

  emit({
    type: "job:progress",
    jobId,
    sceneId: job.sceneId,
    progress,
    eta: eta ?? null,
  });

  return job;
}

export async function completeJob(
  jobId: string,
  resultData: unknown,
  resultAssetVersionId?: string,
  qualityScore?: unknown
): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      status: "completed",
      completedAt: sql`NOW()`,
      progressPct: 100,
      resultData: resultData as Record<string, unknown>,
      resultAssetVersionId: resultAssetVersionId ?? null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();

  emit({
    type: "job:completed",
    jobId,
    jobType: job.jobType,
    sceneId: job.sceneId,
    assetVersionId: resultAssetVersionId ?? null,
    qualityScore: qualityScore ?? null,
    fileUrl: (resultData as Record<string, unknown>)?.file_url as string ?? null,
  });

  return job;
}

export async function failJob(jobId: string, error: string): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      status: "failed",
      lastError: error,
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();

  emit({
    type: "job:failed",
    jobId,
    sceneId: job.sceneId,
    error,
    canRetry: (job.attemptCount ?? 0) < (job.maxAttempts ?? 3),
  });

  return job;
}

export async function retryJob(jobId: string): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      status: "retrying",
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();

  emit({
    type: "job:retrying",
    jobId,
    sceneId: job.sceneId,
    attemptCount: job.attemptCount ?? 0,
  });

  return job;
}

export async function requeueJob(jobId: string): Promise<Job> {
  const [job] = await db
    .update(jobs)
    .set({
      status: "queued",
      attemptCount: 0,
      lastError: null,
      progressPct: 0,
      externalJobId: null,
      externalStatus: null,
      updatedAt: sql`NOW()`,
    })
    .where(eq(jobs.id, jobId))
    .returning();
  return job;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getActiveJobs(): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "submitted", "processing", "retrying"]));
}

/** Jobs in submitted/processing state that haven't updated in 10 minutes. */
export async function getStalledJobs(): Promise<Job[]> {
  return db
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["submitted", "processing"]),
        sql`${jobs.updatedAt} < NOW() - INTERVAL '10 minutes'`
      )
    );
}

export async function getJobsByProject(projectId: string): Promise<Job[]> {
  return db.select().from(jobs).where(eq(jobs.projectId, projectId));
}
