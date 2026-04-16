import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  staticAdJobs,
  staticAdGenerations,
  productProfiles,
  productImages,
} from "@/db/schema";
import { eq, sql, asc, max } from "drizzle-orm";
import { generateStaticAd } from "@/lib/nano-banana";
import { uploadBuffer } from "@/lib/r2";
import { emit } from "@/lib/event-bus";
import type { StaticAdAnalysis, AdCompositionSpec } from "@/lib/claude";
import { compareAdToSpec } from "@/lib/claude";
import { toProductBundle, renderScenePrompt, type StaticAdSpec } from "@/lib/nb2-prompt";

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

  // Load product learnings
  let learningsSection = "";
  try {
    if (job.productId) {
      const { buildLearningsSection } = await import("@/lib/learnings");
      learningsSection = await buildLearningsSection(job.productId);
    }
  } catch {}

  // Load rejection history for this job + same product
  let rejectionHistory = "";
  try {
    const { and: andOp, not: notOp } = await import("drizzle-orm");

    const thisJobRejections = await db
      .select({
        editPrompt: staticAdGenerations.editPrompt,
        rejectionReason: staticAdGenerations.rejectionReason,
      })
      .from(staticAdGenerations)
      .where(
        andOp(
          eq(staticAdGenerations.jobId, id),
          eq(staticAdGenerations.isRejected, true)
        )
      )
      .limit(4);

    if (thisJobRejections.length > 0) {
      rejectionHistory +=
        "From this ad:\n" +
        thisJobRejections
          .filter((r) => r.rejectionReason)
          .map(
            (r) =>
              `- Edit: "${r.editPrompt?.slice(0, 60) ?? "none"}" → Issues: ${r.rejectionReason}`
          )
          .join("\n");
    }

    if (job.productId) {
      const otherJobRejections = await db
        .select({ rejectionReason: staticAdGenerations.rejectionReason })
        .from(staticAdGenerations)
        .innerJoin(staticAdJobs, eq(staticAdGenerations.jobId, staticAdJobs.id))
        .where(
          andOp(
            eq(staticAdJobs.productId, job.productId),
            notOp(eq(staticAdJobs.id, id)),
            eq(staticAdGenerations.isRejected, true)
          )
        )
        .limit(4);

      if (otherJobRejections.length > 0) {
        if (rejectionHistory) rejectionHistory += "\n\n";
        rejectionHistory +=
          "From other ads for this product:\n" +
          otherJobRejections
            .filter((r) => r.rejectionReason)
            .map((r) => `- Issues: ${r.rejectionReason}`)
            .join("\n");
      }
    }
  } catch {}

  // Build NB2 prompt via the prompt construction module
  const analysis = job.psychAnalysis as unknown as StaticAdAnalysis | null;
  const compositionSpec = job.compositionSpec as unknown as AdCompositionSpec | null;

  // Build product bundle from DB data
  const bundles = job.productId
    ? [toProductBundle(
        { name: productName, description: productDescription || null },
        (await db
          .select({ fileUrl: productImages.fileUrl, label: productImages.label, sortOrder: productImages.sortOrder })
          .from(productImages)
          .where(eq(productImages.productId, job.productId))
          .orderBy(asc(productImages.sortOrder))
        ),
      )]
    : [];

  const nb2Spec: StaticAdSpec = {
    kind: "static-ad",
    subject: `Product: "${productName}"${productDescription ? ` — ${productDescription}` : ""}. Place the product from the photos into a clean, professional static ad.`,
    copy: finalCopy,
    products: bundles.length > 0 ? bundles : undefined,
    psychAnalysis: analysis,
    compositionSpec,
    learnings: learningsSection || undefined,
    rejectionHistory: rejectionHistory || undefined,
    editInstructions: resolvedEditPrompt || undefined,
  };
  const nb2Payload = renderScenePrompt(nb2Spec);
  const prompt = nb2Payload.parts
    .filter((p) => p.kind === "text")
    .map((p) => (p as { kind: "text"; text: string }).text)
    .join("\n\n");

  try {
    emit({ type: "static-ad:progress", jobId: id, progress: 30, stage: "generating" });

    const result = await generateStaticAd({
      productImages: productImgs,
      prompt,
      nb2Payload,
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

    // Auto-score the generated ad (non-blocking)
    let generationScore: Record<string, unknown> | undefined;
    try {
      const { scoreGeneration } = await import("@/lib/claude");
      const score = await scoreGeneration({
        prompt,
        outputUrl: outputImageUrl,
      });
      generationScore = score as unknown as Record<string, unknown>;
      await db
        .update(staticAdGenerations)
        .set({ qualityScore: generationScore })
        .where(eq(staticAdGenerations.id, generation.id));
    } catch (err) {
      console.warn("[static-ads/generate] Auto-scoring failed:", err);
    }

    // Post-generation quality gate — compare against compositionSpec if available
    let layoutMismatches: string[] | undefined;
    if (compositionSpec) {
      try {
        const comparison = await compareAdToSpec({
          generatedImageUrl: outputImageUrl,
          compositionSpec,
        });
        // Store quality check on the generation row
        await db
          .update(staticAdGenerations)
          .set({ qualityCheck: comparison as unknown as Record<string, unknown> })
          .where(eq(staticAdGenerations.id, generation.id));
        if (!comparison.match) {
          layoutMismatches = comparison.mismatches;
          console.log(`[static-ads/generate] Layout mismatches (score ${comparison.score}):`, comparison.mismatches);
        }
      } catch (err) {
        console.warn(`[static-ads/generate] Layout comparison failed:`, err);
      }
    }

    // Update job (outputImageUrl used for list page thumbnails)
    const [updated] = await db
      .update(staticAdJobs)
      .set({
        status: "completed",
        outputImageUrl,
        outputFileSizeBytes: buffer.length,
        generationPrompt: prompt,
        qualityScore: (generationScore ?? null) as unknown as Record<string, unknown>,
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

    return NextResponse.json({
      ...updated,
      ...(layoutMismatches ? { layoutMismatches } : {}),
    });
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

