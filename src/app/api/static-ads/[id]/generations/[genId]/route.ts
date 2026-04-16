import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdGenerations } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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

  return NextResponse.json(updated);
}
