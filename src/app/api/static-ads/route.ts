import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdJobs, staticAdGenerations, productProfiles } from "@/db/schema";
import { desc, eq, sql, count } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select({
      id: staticAdJobs.id,
      status: staticAdJobs.status,
      productId: staticAdJobs.productId,
      inputImageUrl: staticAdJobs.inputImageUrl,
      outputImageUrl: staticAdJobs.outputImageUrl,
      createdAt: staticAdJobs.createdAt,
      updatedAt: staticAdJobs.updatedAt,
      productName: productProfiles.name,
      productSlug: productProfiles.slug,
      generationCount: sql<number>`(
        SELECT COUNT(*)::int FROM static_ad_generations
        WHERE static_ad_generations.job_id = ${staticAdJobs.id}
      )`.as("generation_count"),
    })
    .from(staticAdJobs)
    .leftJoin(productProfiles, eq(staticAdJobs.productId, productProfiles.id))
    .orderBy(desc(staticAdJobs.createdAt));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { productId } = (await req.json()) as { productId?: string };

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  // Verify product exists
  const [product] = await db
    .select({ id: productProfiles.id })
    .from(productProfiles)
    .where(eq(productProfiles.id, productId));

  if (!product) {
    return NextResponse.json(
      { error: "Product not found" },
      { status: 404 }
    );
  }

  const [job] = await db
    .insert(staticAdJobs)
    .values({ productId, status: "uploading" })
    .returning();

  return NextResponse.json(job, { status: 201 });
}
