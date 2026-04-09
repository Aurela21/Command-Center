import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, id));
  if (!scene) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(scene);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  // Whitelist patchable fields
  const {
    sceneOrder,
    startFrame,
    endFrame,
    startTimeMs,
    endTimeMs,
    referenceFrame,
    referenceFrameUrl,
    referenceFrameSource,
    boundarySource,
    description,
    scenePrompt,
    scriptSegment,
    startFrameUrl,
    startFrameAnalysis,
    nanoBananaPrompt,
    approvedSeedImageId,
    approvedKlingOutputId,
    seedImageApproved,
    klingPromptApproved,
    klingOutputApproved,
    targetClipDurationS,
  } = body;

  const patch: Record<string, unknown> = { updatedAt: sql`NOW()` };

  if (sceneOrder !== undefined) patch.sceneOrder = sceneOrder;
  if (startFrame !== undefined) patch.startFrame = startFrame;
  if (endFrame !== undefined) patch.endFrame = endFrame;
  if (startTimeMs !== undefined) patch.startTimeMs = startTimeMs;
  if (endTimeMs !== undefined) patch.endTimeMs = endTimeMs;
  if (referenceFrame !== undefined) patch.referenceFrame = referenceFrame;
  if (referenceFrameUrl !== undefined) patch.referenceFrameUrl = referenceFrameUrl;
  if (referenceFrameSource !== undefined) patch.referenceFrameSource = referenceFrameSource;
  if (boundarySource !== undefined) patch.boundarySource = boundarySource;
  if (description !== undefined) patch.description = description;
  if (scenePrompt !== undefined) patch.scenePrompt = scenePrompt;
  if (scriptSegment !== undefined) patch.scriptSegment = scriptSegment;
  if (startFrameUrl !== undefined) patch.startFrameUrl = startFrameUrl;
  if (startFrameAnalysis !== undefined) patch.startFrameAnalysis = startFrameAnalysis;
  if (nanoBananaPrompt !== undefined) patch.nanoBananaPrompt = nanoBananaPrompt;
  if (approvedSeedImageId !== undefined) patch.approvedSeedImageId = approvedSeedImageId;
  if (approvedKlingOutputId !== undefined) patch.approvedKlingOutputId = approvedKlingOutputId;
  if (seedImageApproved !== undefined) patch.seedImageApproved = seedImageApproved;
  if (klingPromptApproved !== undefined) patch.klingPromptApproved = klingPromptApproved;
  if (klingOutputApproved !== undefined) patch.klingOutputApproved = klingOutputApproved;
  if (targetClipDurationS !== undefined) patch.targetClipDurationS = targetClipDurationS;

  const [updated] = await db
    .update(scenes)
    .set(patch)
    .where(eq(scenes.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [deleted] = await db.delete(scenes).where(eq(scenes.id, id)).returning();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
