import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qualityChecks } from "@/db/schema";
import type { QualityScore } from "@/lib/claude";

// POST /api/quality-checks
// Called by job pollers (kling.ts, nano-banana.ts) after scoreGeneration().
// Creates one quality_check record per breakdown dimension.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { assetVersionId, score } = body as {
    assetVersionId: string;
    score: QualityScore;
  };

  if (!assetVersionId || !score) {
    return NextResponse.json(
      { error: "assetVersionId and score are required" },
      { status: 400 }
    );
  }

  const inserts: Array<{
    assetVersionId: string;
    checkType: string;
    score: number;
    details: Record<string, unknown> | null;
    flagged: boolean;
  }> = [
    {
      assetVersionId,
      checkType: "overall",
      score: score.overall,
      details: { notes: score.notes } as Record<string, unknown>,
      flagged: score.overall < 60,
    },
  ];

  // One row per breakdown dimension
  for (const [key, val] of Object.entries(score.breakdown)) {
    if (typeof val === "number") {
      inserts.push({
        assetVersionId,
        checkType: key,
        score: val,
        details: null,
        flagged: val < 60,
      });
    }
  }

  // Lip sync risk flag
  if (score.lipSyncRisk) {
    inserts.push({
      assetVersionId,
      checkType: "lip_sync_risk",
      score: 0,
      details: null,
      flagged: true,
    });
  }

  const created = await db.insert(qualityChecks).values(inserts).returning();
  return NextResponse.json(created, { status: 201 });
}
