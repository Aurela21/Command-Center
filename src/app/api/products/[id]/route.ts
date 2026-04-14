import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productProfiles, productImages } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [profile] = await db
    .select()
    .from(productProfiles)
    .where(eq(productProfiles.id, id));

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.sortOrder));

  return NextResponse.json({ ...profile, images });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    description?: string;
  };

  const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description.trim();

  const [updated] = await db
    .update(productProfiles)
    .set(updates)
    .where(eq(productProfiles.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.delete(productProfiles).where(eq(productProfiles.id, id));
  return NextResponse.json({ ok: true });
}
