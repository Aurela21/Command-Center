import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  staticAdJobs,
  staticAdGenerations,
  productProfiles,
  productImages,
} from "@/db/schema";
import { eq, sql, asc, desc, max } from "drizzle-orm";
import { generateStaticAd } from "@/lib/nano-banana";
import { uploadBuffer } from "@/lib/r2";
import { emit } from "@/lib/event-bus";
import type { StaticAdAnalysis } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as { editPrompt?: string };
  const editPrompt = body.editPrompt?.trim() || null;

  const [job] = await db
    .select()
    .from(staticAdJobs)
    .where(eq(staticAdJobs.id, id));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.inputImageUrl) {
    return NextResponse.json(
      { error: "No input image" },
      { status: 400 }
    );
  }

  const finalCopy = (job.finalCopy ?? job.extractedCopy) as {
    headline: string;
    body: string;
    cta: string;
  } | null;

  if (!finalCopy) {
    return NextResponse.json(
      { error: "No copy available — run analysis first" },
      { status: 400 }
    );
  }

  // Get product images with labels
  let productImgs: Array<{ url: string; label: string }> = [];
  let productName = "Product";
  let productDescription = "";

  if (job.productId) {
    const [product] = await db
      .select({ name: productProfiles.name, description: productProfiles.description })
      .from(productProfiles)
      .where(eq(productProfiles.id, job.productId));

    if (product) {
      productName = product.name;
      productDescription = product.description ?? "";
    }

    const images = await db
      .select({ fileUrl: productImages.fileUrl, label: productImages.label })
      .from(productImages)
      .where(eq(productImages.productId, job.productId))
      .orderBy(asc(productImages.sortOrder))
      .limit(3);

    productImgs = images.map((img) => ({
      url: img.fileUrl,
      label: img.label ?? "product view",
    }));
  }

  // Update status to generating
  await db
    .update(staticAdJobs)
    .set({ status: "generating", updatedAt: sql`NOW()` })
    .where(eq(staticAdJobs.id, id));

  emit({ type: "static-ad:progress", jobId: id, progress: 10, stage: "generating" });

  // Resolve @tags in editPrompt to product image URLs for generation context
  let resolvedEditPrompt = editPrompt;
  if (editPrompt) {
    const tagMatches = editPrompt.match(/@[\w-]+/g) ?? [];
    for (const tag of tagMatches) {
      const slug = tag.slice(1);
      const [profile] = await db
        .select({ name: productProfiles.name })
        .from(productProfiles)
        .where(eq(productProfiles.slug, slug));
      if (profile) {
        // Replace @tag with the product name for the prompt
        resolvedEditPrompt = resolvedEditPrompt!.replace(tag, profile.name);
      }
    }
  }

  // Build generation prompt
  const analysis = job.psychAnalysis as unknown as StaticAdAnalysis | null;
  const prompt = buildGenerationPrompt(
    productName,
    productDescription,
    productImgs.map((img) => img.label),
    finalCopy,
    analysis,
    resolvedEditPrompt,
  );

  try {
    emit({ type: "static-ad:progress", jobId: id, progress: 30, stage: "generating" });

    const result = await generateStaticAd({
      productImages: productImgs,
      prompt,
    });

    emit({ type: "static-ad:progress", jobId: id, progress: 80, stage: "generating" });

    // Resize to 500x500 (1:1) and upload to R2
    const rawBuffer = Buffer.from(result.imageBase64, "base64");
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(rawBuffer)
      .resize(500, 500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();
    const ext = "jpg";
    const key = `static-ads/${id}/output-${Date.now()}.${ext}`;
    const outputImageUrl = await uploadBuffer(key, buffer, "image/jpeg");

    // Determine next version number
    const [maxRow] = await db
      .select({ maxVer: max(staticAdGenerations.versionNumber) })
      .from(staticAdGenerations)
      .where(eq(staticAdGenerations.jobId, id));
    const versionNumber = (maxRow?.maxVer ?? 0) + 1;

    // Insert generation row
    const [generation] = await db
      .insert(staticAdGenerations)
      .values({
        jobId: id,
        versionNumber,
        imageUrl: outputImageUrl,
        referenceImageUrl: job.inputImageUrl,
        fileSizeBytes: buffer.length,
        generationPrompt: prompt,
        editPrompt: editPrompt ?? null,
      })
      .returning();

    // Update job (outputImageUrl used for list page thumbnails)
    const [updated] = await db
      .update(staticAdJobs)
      .set({
        status: "completed",
        outputImageUrl,
        outputFileSizeBytes: buffer.length,
        generationPrompt: prompt,
        updatedAt: sql`NOW()`,
      })
      .where(eq(staticAdJobs.id, id))
      .returning();

    emit({
      type: "static-ad:completed",
      jobId: id,
      outputImageUrl,
      generationId: generation.id,
      versionNumber,
    });

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[static-ads/generate] Generation failed:", msg);

    await db
      .update(staticAdJobs)
      .set({ status: "failed", lastError: msg, updatedAt: sql`NOW()` })
      .where(eq(staticAdJobs.id, id));

    emit({ type: "static-ad:failed", jobId: id, error: msg });

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function buildGenerationPrompt(
  productName: string,
  productDescription: string,
  productImageLabels: string[],
  copy: { headline: string; body: string; cta: string },
  analysis: StaticAdAnalysis | null,
  editPrompt?: string | null
): string {
  let prompt = `Product: "${productName}"${productDescription ? ` — ${productDescription}` : ""}

Place the product from the photos into a clean, professional static ad.

Text to include in the ad:
Headline: ${copy.headline}
Body: ${copy.body}
CTA: ${copy.cta}`;

  if (analysis) {
    prompt += `

PSYCHOLOGICAL STRUCTURE TO PRESERVE:
- Visual hierarchy: ${analysis.visualHierarchy}
- Color psychology: ${analysis.colorPsychology}
- Attention mechanics: ${analysis.attentionMechanics}
- CTA approach: ${analysis.ctaAnalysis}`;
  }

  if (editPrompt) {
    prompt += `

USER EDIT INSTRUCTIONS (HIGH PRIORITY — apply these changes to the output):
${editPrompt}`;
  }

  return prompt;
}
