/**
 * POST /api/projects/[id]/reject-version
 * Body: { assetVersionId: string }
 *
 * Marks an asset version as rejected. Claude Vision analyzes the image
 * against the generation prompt to understand why it failed — this
 * rejection analysis is stored and fed into future prompt refinement.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assetVersions } from "@/db/schema";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function analyzeRejection(
  imageUrl: string,
  generationPrompt: string | null
): Promise<string> {
  try {
    const msg = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text: `This AI-generated image was rejected by the user. Analyze what's wrong with it.

${generationPrompt ? `The generation prompt was: "${generationPrompt}"` : "No generation prompt was recorded."}

Identify specific issues in 2-4 bullet points. Focus on:
- Product fidelity issues (wrong colors, missing features, distorted details)
- Composition problems (bad framing, awkward pose, wrong aspect ratio)
- Quality issues (artifacts, blurriness, uncanny elements)
- Prompt adherence failures (doesn't match what was asked for)

Be specific and actionable — these insights will be used to improve future generation prompts. Return ONLY the bullet points, no preamble.`,
            },
          ],
        },
      ],
    });

    return msg.content[0].type === "text" ? msg.content[0].text.trim() : "Analysis unavailable";
  } catch (err) {
    console.error("[reject-version] Claude analysis failed:", err);
    return "Analysis failed — image was still rejected";
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: _projectId } = await params;
  const { assetVersionId } = (await req.json()) as { assetVersionId: string };

  if (!assetVersionId) {
    return NextResponse.json(
      { error: "assetVersionId is required" },
      { status: 400 }
    );
  }

  const [av] = await db
    .select()
    .from(assetVersions)
    .where(eq(assetVersions.id, assetVersionId));

  if (!av) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Analyze why it's bad
  console.log(`[reject-version] Analyzing rejection for ${assetVersionId}…`);
  const rejectionReason = await analyzeRejection(
    av.fileUrl,
    av.generationPrompt
  );

  // Mark as rejected
  const [updated] = await db
    .update(assetVersions)
    .set({
      isRejected: true,
      isApproved: false,
      rejectionReason,
    })
    .where(eq(assetVersions.id, assetVersionId))
    .returning();

  console.log(`[reject-version] Rejected ${assetVersionId}: ${rejectionReason.slice(0, 80)}…`);

  return NextResponse.json({
    id: updated.id,
    rejectionReason,
  });
}
