/**
 * POST /api/projects/[id]/upload-hero
 * Multipart form: file (image)
 *
 * Uploads an image as a hero model image. Resizes to 720x1280 (9:16),
 * stores in R2, and adds to the project's hero_images array.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { uploadBuffer } from "@/lib/r2";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

type HeroImage = {
  id: string;
  url: string;
  prompt: string;
  sourceFrame: number;
  createdAt: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Read file to buffer
  const arrayBuffer = await file.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);

  // Resize to 9:16 (720x1280)
  const sharp = (await import("sharp")).default;
  const resizedBuffer = await sharp(rawBuffer)
    .resize(720, 1280, { fit: "cover", position: "centre" })
    .jpeg({ quality: 90 })
    .toBuffer();

  // Upload to R2
  const key = `hero-images/${projectId}/${Date.now()}.jpg`;
  const fileUrl = await uploadBuffer(key, resizedBuffer, "image/jpeg");

  // Build hero image entry
  const heroEntry: HeroImage = {
    id: randomUUID(),
    url: fileUrl,
    prompt: "Uploaded image",
    sourceFrame: -1,
    createdAt: new Date().toISOString(),
  };

  // Append to project's hero_images array
  const existingHeroes = (project.heroImages as HeroImage[] | null) ?? [];
  const updatedHeroes = [...existingHeroes, heroEntry];

  await db
    .update(projects)
    .set({
      heroImages: updatedHeroes as unknown as Record<string, unknown>[],
      updatedAt: sql`NOW()`,
    })
    .where(eq(projects.id, projectId));

  return NextResponse.json({
    heroImage: heroEntry,
    heroImages: updatedHeroes,
  });
}
