import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import type { NewScene } from "@/db/schema";
import { ensureSchema } from "@/db/ensure-schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await ensureSchema();
  const rows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, id))
    .orderBy(asc(scenes.sceneOrder));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  await ensureSchema();
  const url = new URL(req.url);
  const replace = url.searchParams.get("replace") === "true";

  const body = await req.json();

  // Accept a single scene object or an array (for bulk creation on manifest approval)
  const inputs: Omit<NewScene, "id" | "createdAt" | "updatedAt">[] = (
    Array.isArray(body) ? body : [body]
  ).map((s) => ({ ...s, projectId }));

  if (replace) {
    // Delete all existing scenes for this project then recreate
    await db.delete(scenes).where(eq(scenes.projectId, projectId));
  }

  if (inputs.length === 0) {
    return NextResponse.json([], { status: 201 });
  }

  const created = await db.insert(scenes).values(inputs).returning();

  return NextResponse.json(Array.isArray(body) ? created : created[0], {
    status: 201,
  });
}
