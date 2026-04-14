/**
 * PATCH /api/projects/[id]/scenes/[sceneId]
 *
 * Persists per-scene approval state and optional field updates.
 * Accepted fields: approvedSeedImageId, seedImageApproved, klingPromptApproved
 *
 * When approvedSeedImageId changes, the corresponding asset_version.is_approved
 * is toggled so the production-state endpoint reflects it on next load.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, assetVersions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string; sceneId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, sceneId } = await params;

  const body = (await req.json()) as {
    approvedSeedImageId?: string | null;
    seedImageApproved?: boolean;
    klingPromptApproved?: boolean;
  };

  // Verify scene belongs to this project
  const [existing] = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // If changing the approved seed image, update asset_version.is_approved
  if ("approvedSeedImageId" in body) {
    // Clear all seed image approvals for this scene
    await db
      .update(assetVersions)
      .set({ isApproved: false })
      .where(
        and(
          eq(assetVersions.sceneId, sceneId),
          eq(assetVersions.assetType, "seed_image")
        )
      );
    // Set the new approved version (if not null)
    if (body.approvedSeedImageId) {
      await db
        .update(assetVersions)
        .set({ isApproved: true })
        .where(eq(assetVersions.id, body.approvedSeedImageId));
    }
  }

  // Build the scene patch
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if ("approvedSeedImageId" in body) patch.approvedSeedImageId = body.approvedSeedImageId ?? null;
  if ("seedImageApproved" in body) patch.seedImageApproved = body.seedImageApproved;
  if ("klingPromptApproved" in body) patch.klingPromptApproved = body.klingPromptApproved;

  const [updated] = await db
    .update(scenes)
    .set(patch)
    .where(eq(scenes.id, sceneId))
    .returning();

  return NextResponse.json(updated);
}
