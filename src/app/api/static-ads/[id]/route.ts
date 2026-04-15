import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdJobs, productProfiles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [row] = await db
    .select({
      id: staticAdJobs.id,
      status: staticAdJobs.status,
      productId: staticAdJobs.productId,
      inputImageUrl: staticAdJobs.inputImageUrl,
      psychAnalysis: staticAdJobs.psychAnalysis,
      extractedCopy: staticAdJobs.extractedCopy,
      finalCopy: staticAdJobs.finalCopy,
      outputImageUrl: staticAdJobs.outputImageUrl,
      outputFileSizeBytes: staticAdJobs.outputFileSizeBytes,
      generationPrompt: staticAdJobs.generationPrompt,
      lastError: staticAdJobs.lastError,
      createdAt: staticAdJobs.createdAt,
      updatedAt: staticAdJobs.updatedAt,
      productName: productProfiles.name,
      productSlug: productProfiles.slug,
    })
    .from(staticAdJobs)
    .leftJoin(productProfiles, eq(staticAdJobs.productId, productProfiles.id))
    .where(eq(staticAdJobs.id, id));

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const updates: Partial<typeof staticAdJobs.$inferInsert> = {};

  if (body.inputImageUrl !== undefined)
    updates.inputImageUrl = body.inputImageUrl;
  if (body.finalCopy !== undefined) updates.finalCopy = body.finalCopy;
  if (body.status !== undefined) updates.status = body.status;
  if (body.lastError !== undefined) updates.lastError = body.lastError;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(staticAdJobs)
    .set({ ...updates, updatedAt: sql`NOW()` })
    .where(eq(staticAdJobs.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
