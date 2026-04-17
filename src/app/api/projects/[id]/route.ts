import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes, jobs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await ensureSchema();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  await ensureSchema();
  const body = await req.json();

  const updates: Partial<typeof projects.$inferInsert> = {};

  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.klingElementTags !== undefined)
    updates.klingElementTags = body.klingElementTags;
  if (body.status !== undefined) updates.status = body.status;
  if (body.voiceoverId !== undefined) updates.voiceoverId = body.voiceoverId;
  if (body.voiceoverName !== undefined)
    updates.voiceoverName = body.voiceoverName;
  if (body.voiceoverSpeed !== undefined)
    updates.voiceoverSpeed = body.voiceoverSpeed;
  if (body.voiceoverMatchPacing !== undefined)
    updates.voiceoverMatchPacing = body.voiceoverMatchPacing;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(projects)
    .set({ ...updates, updatedAt: sql`NOW()` })
    .where(eq(projects.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id));

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascade: scenes, asset_versions, quality_checks, jobs, chat all cascade-delete.
  // Product learnings are safe — they reference products, not projects.
  await db.delete(projects).where(eq(projects.id, id));

  return NextResponse.json({ deleted: true });
}
