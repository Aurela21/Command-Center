import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assetVersions } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { assetVersionId } = (await req.json()) as { assetVersionId: string };

  if (!assetVersionId) {
    return NextResponse.json(
      { error: "assetVersionId is required" },
      { status: 400 }
    );
  }

  const [av] = await db
    .select()
    .from(assetVersions)
    .where(eq(assetVersions.id, assetVersionId));

  if (!av) {
    return NextResponse.json(
      { error: "Asset version not found" },
      { status: 404 }
    );
  }

  // Mark as approved
  const [updated] = await db
    .update(assetVersions)
    .set({ isApproved: true, isRejected: false })
    .where(eq(assetVersions.id, assetVersionId))
    .returning();

  // Fire-and-forget: analyze approval and record positive learning
  (async () => {
    try {
      const { analyzeApproval } = await import("@/lib/claude");
      const analysis = await analyzeApproval(
        av.fileUrl,
        av.generationPrompt
      );

      const { recordLearning, resolveProductFromTags } = await import(
        "@/lib/learnings"
      );
      const productId = await resolveProductFromTags(av.generationPrompt);
      if (productId) {
        await recordLearning({
          productId,
          type: "positive",
          source: av.assetType === "seed_image" ? "seed_image" : "kling_video",
          sourceId: assetVersionId,
          rawAnalysis: analysis,
        });
      }
    } catch (err) {
      console.warn("[approve-version] Approval analysis failed:", err);
    }
  })();

  return NextResponse.json({ id: updated.id, isApproved: true });
}
