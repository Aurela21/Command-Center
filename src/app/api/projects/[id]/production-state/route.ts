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
import { scenes, assetVersions, jobs } from "@/db/schema";
import { eq, asc, desc, inArray } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const [sceneRows, jobRows] = await Promise.all([
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

  let assetRows: typeof assetVersions.$inferSelect[] = [];
  if (sceneRows.length > 0) {
    const sceneIds = sceneRows.map((s) => s.id);
    assetRows = await db
      .select()
      .from(assetVersions)
      .where(inArray(assetVersions.sceneId, sceneIds))
      .orderBy(asc(assetVersions.versionNumber));
  }

  return NextResponse.json({
    scenes: sceneRows,
    assetVersions: assetRows,
    jobs: jobRows,
  });
}
