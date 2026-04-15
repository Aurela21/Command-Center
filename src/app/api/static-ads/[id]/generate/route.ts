import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  staticAdJobs,
  productProfiles,
  productImages,
} from "@/db/schema";
import { eq, sql, asc } from "drizzle-orm";
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

    // Upload to R2
    const buffer = Buffer.from(result.imageBase64, "base64");
    const ext = result.mimeType.includes("png") ? "png" : "jpg";
    const key = `static-ads/${id}/output-${Date.now()}.${ext}`;
    const outputImageUrl = await uploadBuffer(key, buffer, result.mimeType);

    // Update job
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

    emit({ type: "static-ad:completed", jobId: id, outputImageUrl });

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
  let prompt = `Create a static ad for the product "${productName}".

AD COPY TO USE:
- Headline: ${copy.headline}
- Body: ${copy.body}
- CTA: ${copy.cta}`;

  // Product ground truth — this tells the model exactly what the product is
  if (productDescription || productImageLabels.length > 0) {
    prompt += `

PRODUCT GROUND TRUTH — This is the ONLY source of truth about the product:`;
    if (productDescription) {
      prompt += `
Description: ${productDescription}`;
    }
    if (productImageLabels.length > 0) {
      prompt += `
Product photos provided: ${productImageLabels.join(", ")}`;
    }
    prompt += `
The product has ONLY the features visible in the product photos and described above. If a feature is NOT visible in the photos and NOT mentioned in the description, it DOES NOT EXIST on this product. Do NOT add any feature, text, logo, pattern, graphic, or detail that is not clearly visible in the product photos.`;
  }

  prompt += `

LAYOUT INSTRUCTIONS:
- Use the layout reference ad ONLY for compositional inspiration (text placement, visual hierarchy, spacing)
- The product in the layout reference is a DIFFERENT product — ignore its features entirely
- Show the product from the PRODUCT PHOTOS — match it exactly as photographed
- Include all the ad copy text exactly as specified above
- Maintain professional ad quality — crisp text, clean composition
- Output a single static ad image`;

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
