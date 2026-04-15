/**
 * PATCH /api/projects/[id]/reorder-scenes
 * Body: { sceneIds: string[] } — ordered array of scene IDs in new order
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { sceneIds } = (await req.json()) as { sceneIds: string[] };

  if (!sceneIds?.length) {
    return NextResponse.json({ error: "sceneIds required" }, { status: 400 });
  }

  // Update each scene's order — use negative temp values to avoid unique constraint violations
  for (let i = 0; i < sceneIds.length; i++) {
    await db
      .update(scenes)
      .set({ sceneOrder: -(i + 1), updatedAt: sql`NOW()` })
      .where(eq(scenes.id, sceneIds[i]));
  }

  // Now set to positive values
  for (let i = 0; i < sceneIds.length; i++) {
    await db
      .update(scenes)
      .set({ sceneOrder: i + 1 })
      .where(eq(scenes.id, sceneIds[i]));
  }

  return NextResponse.json({ reordered: sceneIds.length });
}
