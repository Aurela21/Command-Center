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
import { scenes, assetVersions, jobs, knowledgeDocuments } from "@/db/schema";
import { eq, and, inArray, sql, ilike } from "drizzle-orm";
import { createJob, completeJob, failJob } from "@/lib/job-queue";
import { generateSeedImage } from "@/lib/nano-banana";
import { uploadBuffer, publicUrl } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 120; // Gemini image gen can take up to 30s

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { sceneId, prompt } = (await req.json()) as {
    sceneId: string;
    prompt: string;
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

  // Resolve reference image URL — stored URL or computed fallback
  let imageUrl = scene.referenceFrameUrl ?? scene.startFrameUrl ?? null;
  if (!imageUrl) {
    const R2_PUBLIC =
      process.env.R2_PUBLIC_URL ??
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ??
      "";
    if (R2_PUBLIC) {
      const sec = Math.round(scene.referenceFrame / 30);
      imageUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(sec).padStart(4, "0")}.jpg`;
    }
  }
  if (!imageUrl) {
    return NextResponse.json(
      { error: "Scene has no reference frame image." },
      { status: 400 }
    );
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

  // Parse @tags from prompt and look up product asset images
  const tagMatches = prompt.match(/@[\w-]+/g) ?? [];
  const productImageUrls: string[] = [];
  for (const tag of tagMatches) {
    const tagName = tag.slice(1); // remove @
    // Match by filename (without extension) — e.g. @black-t-shirt matches "black-t-shirt.jpg"
    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(
        and(
          eq(knowledgeDocuments.category, "product_assets"),
          eq(knowledgeDocuments.status, "ready"),
          ilike(knowledgeDocuments.name, `${tagName}%`)
        )
      );
    if (doc?.fileUrl) {
      const url = doc.fileUrl.startsWith("http") ? doc.fileUrl : publicUrl(doc.fileUrl);
      productImageUrls.push(url);
      console.log(`[generate-seed] Resolved ${tag} → ${url}`);
    } else {
      console.warn(`[generate-seed] @tag "${tagName}" not found in product_assets`);
    }
  }

  // Generate image synchronously via Gemini
  try {
    console.log(`[generate-seed] Calling Gemini for scene ${sceneId} with ${productImageUrls.length} product ref(s)…`);
    const { imageBase64, mimeType } = await generateSeedImage({
      imageUrl,
      prompt,
      referenceImageUrls: productImageUrls.length > 0 ? productImageUrls : undefined,
    });

    // Upload to R2
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const key = `seed-images/${sceneId}/${Date.now()}.${ext}`;
    const fileUrl = await uploadBuffer(
      key,
      Buffer.from(imageBase64, "base64"),
      mimeType
    );
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
