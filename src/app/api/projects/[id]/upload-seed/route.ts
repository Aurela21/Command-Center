/**
 * POST /api/projects/[id]/upload-seed
 * Multipart form: file (image), sceneId (string)
 *
 * Uploads an image as a seed version for a scene.
 * Resizes to 720x1280 (9:16), stores in R2, creates asset_version.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, assetVersions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { uploadBuffer } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const sceneId = formData.get("sceneId") as string | null;

  if (!file || !sceneId) {
    return NextResponse.json({ error: "file and sceneId required" }, { status: 400 });
  }

  // Verify scene belongs to project
  const [scene] = await db.select().from(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.projectId, projectId)));
  if (!scene) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // Read and resize to 9:16
  const arrayBuffer = await file.arrayBuffer();
  const sharp = (await import("sharp")).default;
  const resizedBuffer = await sharp(Buffer.from(arrayBuffer))
    .resize(720, 1280, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Upload to R2
  const key = `seed-images/${sceneId}/${Date.now()}.jpg`;
  const fileUrl = await uploadBuffer(key, resizedBuffer, "image/jpeg");

  // Count existing versions
  const existing = await db
    .select({ id: assetVersions.id })
    .from(assetVersions)
    .where(and(eq(assetVersions.sceneId, sceneId), eq(assetVersions.assetType, "seed_image")));

  // Create asset version
  const [av] = await db
    .insert(assetVersions)
    .values({
      sceneId,
      assetType: "seed_image",
      versionNumber: existing.length + 1,
      fileUrl,
      generationPrompt: "Uploaded image",
    })
    .returning();

  return NextResponse.json({ assetVersionId: av.id, imageUrl: fileUrl });
}
