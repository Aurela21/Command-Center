/**
 * PATCH /api/projects/[id]/asset-versions/[versionId]
 * Body: { generationPrompt?: string }
 *
 * Updates editable fields on an asset version.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assetVersions } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string; versionId: string }> };

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: Params) {
  const { versionId } = await params;
  const body = (await req.json()) as { generationPrompt?: string };

  const patch: Record<string, unknown> = {};
  if ("generationPrompt" in body) patch.generationPrompt = body.generationPrompt;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(assetVersions)
    .set(patch)
    .where(eq(assetVersions.id, versionId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Asset version not found" }, { status: 404 });
  }

  return NextResponse.json({ id: updated.id, generationPrompt: updated.generationPrompt });
}
