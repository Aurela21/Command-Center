import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdGenerations, staticAdJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string; genId: string }> };

function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, genId } = await params;

  const [gen] = await db
    .select()
    .from(staticAdGenerations)
    .where(eq(staticAdGenerations.id, genId));

  if (!gen || gen.jobId !== id) {
    return NextResponse.json(
      { error: "Generation not found" },
      { status: 404 }
    );
  }

  // Mark as rejected immediately (fast response to UI)
  const [updated] = await db
    .update(staticAdGenerations)
    .set({ isRejected: true, rejectionReason: "Analyzing..." })
    .where(eq(staticAdGenerations.id, genId))
    .returning();

  // Fire-and-forget: Claude analysis + learning recording
  (async () => {
    try {
      const msg = await getClient().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: gen.imageUrl } },
              {
                type: "text",
                text: `This AI-generated ad was rejected by the user.${gen.generationPrompt ? `\n\nPrompt: "${gen.generationPrompt.slice(0, 200)}"` : ""}

Identify specific issues in 2-4 bullet points — product fidelity, composition, text placement, quality, prompt adherence. Be specific and actionable. Return ONLY the bullet points.`,
              },
            ],
          },
        ],
      });

      const rejectionReason =
        msg.content[0].type === "text"
          ? msg.content[0].text.trim()
          : "Analysis unavailable";

      // Update with real analysis
      await db
        .update(staticAdGenerations)
        .set({ rejectionReason })
        .where(eq(staticAdGenerations.id, genId));

      // Record negative learning
      const [job] = await db
        .select({ productId: staticAdJobs.productId })
        .from(staticAdJobs)
        .where(eq(staticAdJobs.id, id));
      if (job?.productId) {
        const { recordLearning } = await import("@/lib/learnings");
        await recordLearning({
          productId: job.productId,
          type: "negative",
          source: "static_ad",
          sourceId: genId,
          rawAnalysis: rejectionReason,
        });
      }
    } catch (err) {
      console.warn("[static-ads/reject] Analysis failed:", err);
    }
  })();

  return NextResponse.json({
    id: updated.id,
    rejectionReason: "Analyzing...",
  });
}
