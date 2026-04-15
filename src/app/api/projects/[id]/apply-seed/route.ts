/**
 * POST /api/projects/[id]/apply-seed
 * Body: { sourceVersionId: string, targetSceneIds: string[] }
 *
 * Copies an approved seed image to other scenes.
 * Creates a new asset_version for each target scene pointing to the same
 * image file, and auto-approves it.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assetVersions, scenes } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { sourceVersionId, targetSceneIds } = (await req.json()) as {
    sourceVersionId: string;
    targetSceneIds: string[];
  };

  if (!sourceVersionId || !targetSceneIds?.length) {
    return NextResponse.json(
      { error: "sourceVersionId and targetSceneIds are required" },
      { status: 400 }
    );
  }

  // Get source asset version
  const [source] = await db
    .select()
    .from(assetVersions)
    .where(eq(assetVersions.id, sourceVersionId));

  if (!source || source.assetType !== "seed_image") {
    return NextResponse.json({ error: "Source seed not found" }, { status: 404 });
  }

  // Verify target scenes belong to this project
  const targetScenes = await db
    .select()
    .from(scenes)
    .where(
      and(
        eq(scenes.projectId, projectId),
        inArray(scenes.id, targetSceneIds)
      )
    );

  if (targetScenes.length === 0) {
    return NextResponse.json({ error: "No valid target scenes" }, { status: 400 });
  }

  const created: Array<{ sceneId: string; versionId: string }> = [];

  for (const targetScene of targetScenes) {
    // Count existing seed versions for this scene
    const existing = await db
      .select({ id: assetVersions.id })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.sceneId, targetScene.id),
          eq(assetVersions.assetType, "seed_image")
        )
      );

    // Un-approve any currently approved seeds for this scene
    if (existing.length > 0) {
      await db
        .update(assetVersions)
        .set({ isApproved: false })
        .where(
          and(
            eq(assetVersions.sceneId, targetScene.id),
            eq(assetVersions.assetType, "seed_image")
          )
        );
    }

    // Create new asset version with the same image, auto-approved
    const [av] = await db
      .insert(assetVersions)
      .values({
        sceneId: targetScene.id,
        assetType: "seed_image",
        versionNumber: existing.length + 1,
        fileUrl: source.fileUrl,
        generationPrompt: source.generationPrompt,
        isApproved: true,
      })
      .returning();

    // Update scene to mark seed approved
    await db
      .update(scenes)
      .set({
        approvedSeedImageId: av.id,
        seedImageApproved: true,
      })
      .where(eq(scenes.id, targetScene.id));

    created.push({ sceneId: targetScene.id, versionId: av.id });
  }

  console.log(`[apply-seed] Applied seed ${sourceVersionId} to ${created.length} scene(s)`);

  return NextResponse.json({
    applied: created,
    sourceFileUrl: source.fileUrl,
    sourcePrompt: source.generationPrompt,
  });
}
