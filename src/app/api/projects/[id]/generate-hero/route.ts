/**
 * POST /api/projects/[id]/generate-hero
 * Body: { sourceFrame: number, prompt: string }
 *
 * Generates a "hero model" image — the canonical model + setting look
 * that will be used as the base for all per-scene seed image generation.
 *
 * Uses the same Higgsfield Seedream model as seed generation.
 * Stores the result in the project's hero_images JSONB array.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, productProfiles, productImages } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { generateSeedImage } from "@/lib/nano-banana";
import { uploadBuffer } from "@/lib/r2";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 120;

// Ensure hero columns exist (same as production-state)
let heroColumnsChecked = false;
async function ensureHeroColumns() {
  if (heroColumnsChecked) return;
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS hero_source_frame INTEGER,
        ADD COLUMN IF NOT EXISTS hero_images JSONB,
        ADD COLUMN IF NOT EXISTS approved_hero_url TEXT
    `);
  } catch {
    // Column may already exist
  }
  heroColumnsChecked = true;
}

type HeroImage = {
  id: string;
  url: string;
  prompt: string;
  sourceFrame: number;
  createdAt: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  await ensureHeroColumns();
  const { id: projectId } = await params;
  const { sourceFrame, prompt, fromScratch } = (await req.json()) as {
    sourceFrame?: number;
    prompt: string;
    fromScratch?: boolean;
  };

  if (!prompt?.trim()) {
    return NextResponse.json(
      { error: "prompt is required" },
      { status: 400 }
    );
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Build source frame URL (null for from-scratch generation)
  let imageUrl: string | null = null;
  if (!fromScratch && sourceFrame != null) {
    const R2_PUBLIC =
      process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
    imageUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(sourceFrame).padStart(4, "0")}.jpg`;
  }

  // Resolve @tags for product reference images with labels
  const tagMatches = prompt.match(/@[\w-]+/g) ?? [];
  type RefImg = { url: string; label?: string };
  const refImages: RefImg[] = [];
  let productContext = "";

  for (const tag of tagMatches) {
    const slug = tag.slice(1);
    const [profile] = await db
      .select()
      .from(productProfiles)
      .where(eq(productProfiles.slug, slug));

    if (profile) {
      const images = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, profile.id))
        .orderBy(asc(productImages.sortOrder));

      for (const img of images) {
        refImages.push({ url: img.fileUrl, label: img.label ?? undefined });
      }

      const labels = images.map((img) => img.label).filter(Boolean).join(", ");
      productContext += `\n\nProduct "${profile.name}" (${tag}): ${profile.description || "No description."}`;
      if (labels) productContext += `\nImage angles: ${labels}`;
    }
  }

  // Deduplicate by URL, cap at 5
  const seenUrls = new Set<string>();
  const uniqueRefs = refImages.filter((r) => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  }).slice(0, 5);

  const enrichedPrompt = productContext
    ? `${prompt}\n\n--- Product Reference ---${productContext}`
    : prompt;

  try {
    console.log(`[generate-hero] Generating hero for project ${projectId}${fromScratch ? " (from scratch)" : `, frame ${sourceFrame}`} with ${uniqueRefs.length} ref(s)`);

    const { imageBase64 } = await generateSeedImage({
      imageUrl,
      prompt: enrichedPrompt,
      referenceImages: uniqueRefs.length > 0 ? uniqueRefs : undefined,
    });

    // Enforce 9:16 aspect ratio — crop/resize to 720x1280
    const sharp = (await import("sharp")).default;
    const rawBuffer = Buffer.from(imageBase64, "base64");
    const resizedBuffer = await sharp(rawBuffer)
      .resize(720, 1280, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Upload to R2
    const key = `hero-images/${projectId}/${Date.now()}.jpg`;
    const fileUrl = await uploadBuffer(key, resizedBuffer, "image/jpeg");
    console.log(`[generate-hero] Uploaded to R2: ${key} (720x1280)`);

    // Build hero image entry
    const heroEntry: HeroImage = {
      id: randomUUID(),
      url: fileUrl,
      prompt,
      sourceFrame: sourceFrame ?? -1,
      createdAt: new Date().toISOString(),
    };

    // Append to project's hero_images array
    const existingHeroes = (project.heroImages as HeroImage[] | null) ?? [];
    const updatedHeroes = [...existingHeroes, heroEntry];

    await db
      .update(projects)
      .set({
        heroImages: updatedHeroes as unknown as Record<string, unknown>[],
        heroSourceFrame: sourceFrame,
        updatedAt: sql`NOW()`,
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({
      heroImage: heroEntry,
      heroImages: updatedHeroes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-hero] Generation failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * PATCH /api/projects/[id]/generate-hero
 * Body: { approvedHeroUrl: string } or { removeHeroId: string }
 *
 * Approve a hero image or remove one from the list.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  await ensureHeroColumns();
  const { id: projectId } = await params;
  const body = (await req.json()) as {
    approvedHeroUrl?: string;
    removeHeroId?: string;
  };

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const heroes = (project.heroImages as HeroImage[] | null) ?? [];

  if (body.removeHeroId) {
    const filtered = heroes.filter((h) => h.id !== body.removeHeroId);
    const wasApproved = heroes.find((h) => h.id === body.removeHeroId)?.url === project.approvedHeroUrl;
    await db
      .update(projects)
      .set({
        heroImages: filtered as unknown as Record<string, unknown>[],
        ...(wasApproved ? { approvedHeroUrl: null } : {}),
        updatedAt: sql`NOW()`,
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ heroImages: filtered, approvedHeroUrl: wasApproved ? null : project.approvedHeroUrl });
  }

  if (body.approvedHeroUrl !== undefined) {
    await db
      .update(projects)
      .set({
        approvedHeroUrl: body.approvedHeroUrl || null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(projects.id, projectId));

    return NextResponse.json({ approvedHeroUrl: body.approvedHeroUrl });
  }

  return NextResponse.json({ error: "No action" }, { status: 400 });
}
