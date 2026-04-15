/**
 * POST /api/projects/[id]/generate-seed
 * Body: { sceneId: string, prompt: string }
 *
 * Generates a seed image synchronously via Gemini image generation.
 * Creates a job record, runs generation inline, uploads to R2, emits SSE,
 * and returns the result. Typically takes 10–30 seconds.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, assetVersions, jobs, productProfiles, productImages } from "@/db/schema";
import { eq, and, inArray, sql, asc } from "drizzle-orm";
import { createJob, completeJob, failJob } from "@/lib/job-queue";
import { generateSeedImage } from "@/lib/nano-banana";
import { uploadBuffer } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 120; // Gemini image gen can take up to 30s

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { sceneId, prompt, heroImageUrl, baseImageUrl } = (await req.json()) as {
    sceneId: string;
    prompt: string;
    heroImageUrl?: string; // approved hero model image — used as base instead of reference frame
    baseImageUrl?: string; // edit mode — use this existing image as the base for refinement
  };

  if (!sceneId || !prompt?.trim()) {
    return NextResponse.json(
      { error: "sceneId and prompt are required" },
      { status: 400 }
    );
  }

  // Get scene
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
  if (!scene || scene.projectId !== projectId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // Determine the base image (priority order):
  // 1. Edit mode: use the existing generated image as base for refinement
  // 2. Hero mode: use the approved hero model image
  // 3. Normal mode: use the scene's reference frame
  let imageUrl: string | null = null;

  if (baseImageUrl) {
    // Edit mode — refining an existing generated image
    imageUrl = baseImageUrl;
    console.log(`[generate-seed] Edit mode: refining existing image`);
  } else if (heroImageUrl) {
    // Hero mode — the hero image IS the base, scene frame is for pose reference
    imageUrl = heroImageUrl;
    console.log(`[generate-seed] Hero mode: using approved hero as base`);
  } else {
    // Normal mode — use scene reference frame
    imageUrl = scene.referenceFrameUrl ?? scene.startFrameUrl ?? null;
    if (!imageUrl) {
      const R2_PUBLIC =
        process.env.R2_PUBLIC_URL ??
        process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
        "";
      if (R2_PUBLIC && scene.referenceFrame > 0) {
        const sec = Math.round(scene.referenceFrame / 30);
        imageUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(sec).padStart(4, "0")}.jpg`;
      }
    }
    // imageUrl can be null for concept projects — text-to-image generation
  }

  // Cancel any stuck queued jobs for this scene so they don't pile up
  const stuckJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.sceneId, sceneId),
        eq(jobs.jobType, "nano_banana"),
        inArray(jobs.status, ["queued", "submitted", "retrying"])
      )
    );
  for (const j of stuckJobs) {
    await db
      .update(jobs)
      .set({ status: "failed", lastError: "Superseded by new request", updatedAt: sql`NOW()` })
      .where(eq(jobs.id, j.id));
  }

  // Persist prompt to scene
  await db
    .update(scenes)
    .set({ nanoBananaPrompt: prompt, updatedAt: sql`NOW()` })
    .where(eq(scenes.id, sceneId));

  // Create job record
  const job = await createJob({
    projectId,
    sceneId,
    jobType: "nano_banana",
    status: "queued",
    resultData: { prompt },
  });

  // Parse @tags from prompt and look up product profiles
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

      console.log(`[generate-seed] Resolved ${tag} → ${images.length} images`);
    } else {
      console.warn(`[generate-seed] @tag "${slug}" not found in product_profiles`);
    }
  }

  // In hero mode, add the scene's reference frame as pose reference (no label = pose ref)
  if (heroImageUrl) {
    let sceneFrameUrl = scene.referenceFrameUrl ?? scene.startFrameUrl ?? null;
    if (!sceneFrameUrl) {
      const R2_PUBLIC = process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
      if (R2_PUBLIC) {
        const sec = Math.round(scene.referenceFrame / 30);
        sceneFrameUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(sec).padStart(4, "0")}.jpg`;
      }
    }
    if (sceneFrameUrl) {
      refImages.unshift({ url: sceneFrameUrl }); // no label = pose ref
    }
  }

  // Deduplicate by URL, cap at 6 (1 pose + 5 product = safe for Gemini)
  const seenUrls = new Set<string>();
  const uniqueRefs = refImages.filter((r) => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  }).slice(0, 6);

  // Enrich prompt with product text context
  const enrichedPrompt = productContext
    ? `${prompt}\n\n--- Product Reference ---${productContext}`
    : prompt;

  // Generate image via Nano Banana Pro
  try {
    console.log(`[generate-seed] Generating for scene ${sceneId} with ${uniqueRefs.length} ref image(s)`);
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
    console.log(`[generate-seed] Resized to 720x1280 (9:16)`);

    // Upload to R2
    const key = `seed-images/${sceneId}/${Date.now()}.jpg`;
    const fileUrl = await uploadBuffer(key, resizedBuffer, "image/jpeg");
    console.log(`[generate-seed] Uploaded to R2: ${key}`);

    // Count existing versions
    const existing = await db
      .select({ id: assetVersions.id })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.sceneId, sceneId),
          eq(assetVersions.assetType, "seed_image")
        )
      );

    // Create asset_version record
    const [av] = await db
      .insert(assetVersions)
      .values({
        sceneId,
        assetType: "seed_image",
        versionNumber: existing.length + 1,
        fileUrl,
        generationPrompt: prompt,
      })
      .returning();

    // Complete job + emit SSE
    await completeJob(job.id, { file_url: fileUrl }, av.id);

    return NextResponse.json({
      jobId: job.id,
      assetVersionId: av.id,
      imageUrl: fileUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-seed] Generation failed:", msg);
    await failJob(job.id, msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
