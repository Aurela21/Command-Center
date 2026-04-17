/**
 * GET /api/projects/[id]/production-state
 *
 * Returns all data needed to initialize the production page:
 * - scenes for the project
 * - asset versions (seed images + kling videos)
 * - recent/active jobs
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, assetVersions, jobs, projects } from "@/db/schema";
import { eq, asc, desc, inArray } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";

type Params = { params: Promise<{ id: string }> };

export type HeroImage = {
  id: string;
  url: string;
  prompt: string;
  sourceFrame: number;
  createdAt: string;
};

export type VoiceoverGeneration = {
  id: string;
  url: string;
  voiceId: string;
  voiceName: string;
  speed: number;
  matchedPacing: boolean;
  durationMs: number;
  createdAt: string;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  await ensureSchema();

  const [projectRows, sceneRows, jobRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, projectId)),
    db
      .select()
      .from(scenes)
      .where(eq(scenes.projectId, projectId))
      .orderBy(asc(scenes.sceneOrder)),
    db
      .select()
      .from(jobs)
      .where(eq(jobs.projectId, projectId))
      .orderBy(desc(jobs.createdAt)),
  ]);
  const project = projectRows[0];

  let assetRows: typeof assetVersions.$inferSelect[] = [];
  if (sceneRows.length > 0) {
    const sceneIds = sceneRows.map((s) => s.id);
    assetRows = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.sceneId, sceneIds))
      .orderBy(desc(assetVersions.versionNumber));
  }

  // Extracted frame count = video duration × 3fps (hard rule in analyze-scenes).
  // For concept projects (no reference video), extractedFrameCount is 0
  const isConcept = project?.projectType === "concept";
  const FPS_EXTRACT = 3;
  const durationS = (project?.referenceVideoDurationMs ?? 0) / 1000;
  const extractedFrameCount = isConcept ? 0 : Math.round(durationS * FPS_EXTRACT) || 0;

  return NextResponse.json({
    scenes: sceneRows,
    assetVersions: assetRows,
    jobs: jobRows,
    extractedFrameCount,
    projectType: project?.projectType ?? "reference",
    r2PublicUrl: process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "",
    heroImages: (project?.heroImages as HeroImage[] | null) ?? [],
    approvedHeroUrl: project?.approvedHeroUrl ?? null,
    heroSourceFrame: project?.heroSourceFrame ?? null,
    fullScript: project?.fullScript ?? "",
    voiceover: {
      voiceId: project?.voiceoverId ?? null,
      voiceName: project?.voiceoverName ?? null,
      url: project?.voiceoverUrl ?? null,
      speed: project?.voiceoverSpeed ?? 1.0,
      matchPacing: project?.voiceoverMatchPacing ?? false,
      history: (project?.voiceoverHistory as VoiceoverGeneration[] | null) ?? [],
    },
  });
}
