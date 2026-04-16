import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdJobs, productProfiles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { analyzeStaticAd, analyzeAdComposition, generateAdCopy } from "@/lib/claude";
import { emit } from "@/lib/event-bus";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [job] = await db
    .select()
    .from(staticAdJobs)
    .where(eq(staticAdJobs.id, id));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!job.inputImageUrl) {
    return NextResponse.json(
      { error: "No input image uploaded yet" },
      { status: 400 }
    );
  }

  // Update status to analyzing
  await db
    .update(staticAdJobs)
    .set({ status: "analyzing", updatedAt: sql`NOW()` })
    .where(eq(staticAdJobs.id, id));

  emit({ type: "static-ad:progress", jobId: id, progress: 10, stage: "analyzing" });

  try {
    // Run Claude Vision analysis + composition spec in parallel
    emit({ type: "static-ad:progress", jobId: id, progress: 30, stage: "analyzing" });
    const [psychAnalysis, compositionSpec] = await Promise.all([
      analyzeStaticAd(job.inputImageUrl),
      analyzeAdComposition(job.inputImageUrl),
    ]);

    emit({ type: "static-ad:progress", jobId: id, progress: 60, stage: "analyzing" });

    // Generate suggested ad copy if product is set
    let suggestedCopy = psychAnalysis.extractedCopy;
    if (job.productId) {
      const [product] = await db
        .select({ name: productProfiles.name })
        .from(productProfiles)
        .where(eq(productProfiles.id, job.productId));

      if (product) {
        try {
          suggestedCopy = await generateAdCopy({
            productName: product.name,
            psychAnalysis,
          });
        } catch (err) {
          console.warn("[static-ads/analyze] generateAdCopy failed, using extracted copy:", err);
        }
      }
    }

    emit({ type: "static-ad:progress", jobId: id, progress: 90, stage: "analyzing" });

    // Save analysis + composition spec + extracted copy
    const [updated] = await db
      .update(staticAdJobs)
      .set({
        status: "analyzed",
        psychAnalysis: psychAnalysis as unknown as Record<string, unknown>,
        compositionSpec: compositionSpec as unknown as Record<string, unknown>,
        extractedCopy: suggestedCopy as unknown as Record<string, unknown>,
        updatedAt: sql`NOW()`,
      })
      .where(eq(staticAdJobs.id, id))
      .returning();

    emit({ type: "static-ad:progress", jobId: id, progress: 100, stage: "analyzing" });

    return NextResponse.json({
      psychAnalysis,
      compositionSpec,
      extractedCopy: suggestedCopy,
      job: updated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[static-ads/analyze] Analysis failed:", msg);

    await db
      .update(staticAdJobs)
      .set({ status: "failed", lastError: msg, updatedAt: sql`NOW()` })
      .where(eq(staticAdJobs.id, id));

    emit({ type: "static-ad:failed", jobId: id, error: msg });

    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
