import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, projects } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getJobsByProject, createJob, submitJob } from "@/lib/job-queue";
import { submitKlingJob } from "@/lib/kling";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const rows = await getJobsByProject(projectId);
  return NextResponse.json(rows);
}

/**
 * POST /api/jobs
 * Body: { jobType: "kling_generation", projectId, sceneId }
 *
 * Creates and submits a Kling video generation job for a scene.
 * Requires the scene to have seedImageApproved = true and klingPromptApproved = true.
 */
export async function POST(req: NextRequest) {
  const { jobType, projectId, sceneId, promptOverride } = await req.json() as {
    jobType: string;
    projectId: string;
    sceneId: string;
    promptOverride?: string;
  };

  if (jobType !== "kling_generation") {
    return NextResponse.json(
      { error: "Only kling_generation jobs supported via this endpoint" },
      { status: 400 }
    );
  }

  if (!projectId || !sceneId) {
    return NextResponse.json(
      { error: "projectId and sceneId required" },
      { status: 400 }
    );
  }

  // Load scene + project
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
  if (!scene || scene.projectId !== projectId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const prompt = promptOverride?.trim() || scene.scriptSegment || scene.scenePrompt;
  if (!prompt) {
    return NextResponse.json(
      { error: "Scene has no Kling prompt" },
      { status: 400 }
    );
  }

  // Get approved seed image URL
  const { assetVersions } = await import("@/db/schema");
  const { and } = await import("drizzle-orm");

  let seedImageUrl: string | null = null;

  if (scene.approvedSeedImageId) {
    const [av] = await db
      .select()
      .from(assetVersions)
      .where(eq(assetVersions.id, scene.approvedSeedImageId));
    seedImageUrl = av?.fileUrl ?? null;
  }

  if (!seedImageUrl) {
    // Fall back to any approved seed image for this scene
    const [av] = await db
      .select()
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.sceneId, sceneId),
          eq(assetVersions.assetType, "seed_image"),
          eq(assetVersions.isApproved, true)
        )
      );
    seedImageUrl = av?.fileUrl ?? null;
  }

  if (!seedImageUrl) {
    return NextResponse.json(
      { error: "No approved seed image found for scene" },
      { status: 400 }
    );
  }

  // Cancel any stuck queued kling jobs for this scene
  const { jobs: jobsTable } = await import("@/db/schema");
  const stuckKling = await db
    .select({ id: jobsTable.id })
    .from(jobsTable)
    .where(
      and(
        eq(jobsTable.sceneId, sceneId),
        eq(jobsTable.jobType, "kling_generation"),
        inArray(jobsTable.status, ["queued", "retrying"])
      )
    );
  for (const j of stuckKling) {
    await db
      .update(jobsTable)
      .set({ status: "failed", lastError: "Superseded by new request", updatedAt: sql`NOW()` })
      .where(eq(jobsTable.id, j.id));
  }

  // Kling only accepts 5 or 10 — snap to whichever is closest
  const targetDuration = scene.targetClipDurationS ?? 5;
  const durationSeconds = targetDuration <= 7.5 ? 5 : 10;

  const elementTags = (project.klingElementTags as string[]) ?? [];

  // Create job
  const job = await createJob({
    projectId,
    sceneId,
    jobType: "kling_generation",
    status: "queued",
    resultData: { prompt, seed_image_url: seedImageUrl },
  });

  // Submit to Kling
  try {
    const externalJobId = await submitKlingJob({
      imageUrl: seedImageUrl,
      prompt,
      elementTags: elementTags.length > 0 ? elementTags : undefined,
      durationSeconds,
    });
    await submitJob(job.id, externalJobId);
    return NextResponse.json({ jobId: job.id, externalJobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[jobs/POST] Kling submit failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
