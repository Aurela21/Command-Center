import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdGenerations, staticAdJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string; genId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { genId } = await params;
  const body = await req.json();

  const updates: Partial<typeof staticAdGenerations.$inferInsert> = {};

  if (body.isFavorite !== undefined) updates.isFavorite = body.isFavorite;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(staticAdGenerations)
    .set(updates)
    .where(eq(staticAdGenerations.id, genId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fire-and-forget: analyze approval and record positive learning when favoriting
  if (body.isFavorite === true) {
    (async () => {
      try {
        const [job] = await db
          .select({ productId: staticAdJobs.productId })
          .from(staticAdJobs)
          .where(eq(staticAdJobs.id, updated.jobId));
        if (!job?.productId) return;

        const { analyzeApproval } = await import("@/lib/claude");
        const analysis = await analyzeApproval(
          updated.imageUrl,
          updated.generationPrompt
        );

        const { recordLearning } = await import("@/lib/learnings");
        await recordLearning({
          productId: job.productId,
          type: "positive",
          source: "static_ad",
          sourceId: genId,
          rawAnalysis: analysis,
        });
      } catch (err) {
        console.warn("[static-ads/favorite] Approval analysis failed:", err);
      }
    })();
  }

  return NextResponse.json(updated);
}
