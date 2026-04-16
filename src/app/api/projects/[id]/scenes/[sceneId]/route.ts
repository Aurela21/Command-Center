/**
 * PATCH /api/projects/[id]/scenes/[sceneId]
 * DELETE /api/projects/[id]/scenes/[sceneId]
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, assetVersions, jobs } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string; sceneId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId, sceneId } = await params;

  const body = (await req.json()) as {
    approvedSeedImageId?: string | null;
    seedImageApproved?: boolean;
    klingPromptApproved?: boolean;
    referenceFrame?: number;
    referenceFrameUrl?: string;
    scriptSegment?: string;
    nanoBananaPrompt?: string;
    endFrameUrl?: string | null;
    endFramePrompt?: string | null;
    seedSkipped?: boolean;
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

  // Fire-and-forget: analyze approval and record positive learning
  if (body.approvedSeedImageId) {
    (async () => {
      try {
        const [approvedAv] = await db
          .select()
          .from(assetVersions)
          .where(eq(assetVersions.id, body.approvedSeedImageId!));
        if (!approvedAv) return;

        const { analyzeApproval } = await import("@/lib/claude");
        const analysis = await analyzeApproval(
          approvedAv.fileUrl,
          approvedAv.generationPrompt
        );

        const { recordLearning, resolveProductFromTags } = await import(
          "@/lib/learnings"
        );
        const productId = await resolveProductFromTags(
          approvedAv.generationPrompt
        );
        if (productId) {
          await recordLearning({
            productId,
            type: "positive",
            source: "seed_image",
            sourceId: body.approvedSeedImageId!,
            rawAnalysis: analysis,
          });
        }
      } catch (err) {
        console.warn("[scenes] Approval analysis failed:", err);
      }
    })();
  }

  // Build the scene patch
  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if ("approvedSeedImageId" in body) patch.approvedSeedImageId = body.approvedSeedImageId ?? null;
  if ("seedImageApproved" in body) patch.seedImageApproved = body.seedImageApproved;
  if ("klingPromptApproved" in body) patch.klingPromptApproved = body.klingPromptApproved;
  if ("referenceFrame" in body) patch.referenceFrame = body.referenceFrame;
  if ("referenceFrameUrl" in body) patch.referenceFrameUrl = body.referenceFrameUrl;
  if ("scriptSegment" in body) patch.scriptSegment = body.scriptSegment;
  if ("nanoBananaPrompt" in body) patch.nanoBananaPrompt = body.nanoBananaPrompt;
  if ("endFrameUrl" in body) patch.endFrameUrl = body.endFrameUrl ?? null;
  if ("endFramePrompt" in body) patch.endFramePrompt = body.endFramePrompt ?? null;
  if ("seedSkipped" in body) patch.seedSkipped = body.seedSkipped;

  const [updated] = await db
    .update(scenes)
    .set(patch)
    .where(eq(scenes.id, sceneId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: projectId, sceneId } = await params;

  const [existing] = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));

  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // Clear job references to asset_versions for this scene (prevents FK violation on cascade delete)
  const sceneAssetIds = await db
    .select({ id: assetVersions.id })
    .from(assetVersions)
    .where(eq(assetVersions.sceneId, sceneId));
  if (sceneAssetIds.length > 0) {
    await db
      .update(jobs)
      .set({ resultAssetVersionId: null })
      .where(inArray(jobs.resultAssetVersionId, sceneAssetIds.map((a) => a.id)));
  }
  // Also delete jobs tied to this scene
  await db.delete(jobs).where(eq(jobs.sceneId, sceneId));

  await db.delete(scenes).where(eq(scenes.id, sceneId));

  // Re-number remaining scenes to keep sceneOrder contiguous
  const remaining = await db
    .select({ id: scenes.id })
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(scenes.sceneOrder);

  for (let i = 0; i < remaining.length; i++) {
    await db
      .update(scenes)
      .set({ sceneOrder: i + 1, updatedAt: sql`NOW()` })
      .where(eq(scenes.id, remaining[i].id));
  }

  return NextResponse.json({ deleted: true });
}
