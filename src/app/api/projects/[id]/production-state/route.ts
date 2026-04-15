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
import { eq, asc, desc, inArray, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// Auto-add columns if missing (avoids formal migration)
let columnsChecked = false;
async function ensureColumns() {
  if (columnsChecked) return;
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS hero_source_frame INTEGER,
        ADD COLUMN IF NOT EXISTS hero_images JSONB,
        ADD COLUMN IF NOT EXISTS approved_hero_url TEXT;
      ALTER TABLE scenes
        ADD COLUMN IF NOT EXISTS end_frame_url TEXT,
        ADD COLUMN IF NOT EXISTS end_frame_prompt TEXT,
        ADD COLUMN IF NOT EXISTS seed_skipped BOOLEAN DEFAULT FALSE;
    `);
  } catch {
    // Columns may already exist
  }
  columnsChecked = true;
}

export type HeroImage = {
  id: string;
  url: string;
  prompt: string;
  sourceFrame: number;
  createdAt: string;
};

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  await ensureColumns();

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
  });
}
