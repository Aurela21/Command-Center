/**
 * POST /api/projects/[id]/refine-prompt
 * Body: { prompt, target, sceneId }
 *
 * Takes a brief user prompt and expands it using Claude, pulling relevant
 * knowledge base context (style, kling prompts) and product profile details.
 * Returns the refined prompt for the user to review before generation.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scenes, productProfiles, productImages, assetVersions } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { refinePrompt, type RefineTarget } from "@/lib/claude";
import { embed } from "@/lib/embeddings";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { prompt, target, sceneId } = (await req.json()) as {
    prompt: string;
    target: RefineTarget;
    sceneId: string;
  };

  if (!prompt?.trim() || !target || !sceneId) {
    return NextResponse.json(
      { error: "prompt, target, and sceneId are required" },
      { status: 400 }
    );
  }

  // Load scene
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId));
  if (!scene || scene.projectId !== projectId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  // Resolve product context from @tags
  const tagMatches = prompt.match(/@[\w-]+/g) ?? [];
  let productContext = "";
  for (const tag of tagMatches) {
    const slug = tag.slice(1);
    const [profile] = await db
      .select()
      .from(productProfiles)
      .where(eq(productProfiles.slug, slug));
    if (profile) {
      const images = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, profile.id))
        .orderBy(asc(productImages.sortOrder));
      const labels = images.map((img) => img.label).join(", ");
      productContext += `${profile.name} (${tag}): ${profile.description || "No description."}`;
      if (labels) productContext += ` | Image angles: ${labels}`;
      productContext += "\n";
    }
  }

  // Search knowledge base for style and kling prompting context
  let styleKnowledge = "";
  let klingKnowledge = "";

  try {
    const queryText = `${prompt} ${scene.description ?? ""}`;
    const queryEmbedding = await embed(queryText);
    const embStr = `[${queryEmbedding.join(",")}]`;

    if (target === "seed_image") {
      const rows = await db.execute<{ content: string }>(sql`
        SELECT kc.content
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = 'style'
        ORDER BY kc.embedding <=> ${embStr}::vector
        LIMIT 3
      `);
      styleKnowledge = rows.map((r) => r.content).join("\n\n");
    }

    if (target === "kling_video") {
      const rows = await db.execute<{ content: string }>(sql`
        SELECT kc.content
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = 'kling_prompts'
        ORDER BY kc.embedding <=> ${embStr}::vector
        LIMIT 3
      `);
      klingKnowledge = rows.map((r) => r.content).join("\n\n");
    }
  } catch {
    // Knowledge base optional
  }

  // Resolve reference frame URL for visual context
  let referenceFrameUrl: string | undefined;
  if (target === "seed_image") {
    referenceFrameUrl = scene.referenceFrameUrl ?? undefined;
    if (!referenceFrameUrl) {
      const R2_PUBLIC = process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
      if (R2_PUBLIC) {
        const sec = Math.round(scene.referenceFrame / 30);
        referenceFrameUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(sec).padStart(4, "0")}.jpg`;
      }
    }
  }

  // Look up past rejection reasons for this scene — filtered by asset type
  // so seed image rejections inform seed prompts, video rejections inform Kling prompts
  let rejectionHistory = "";
  try {
    const assetType = target === "seed_image" ? "seed_image" : "kling_output";
    const rejectedVersions = await db
      .select({
        rejectionReason: assetVersions.rejectionReason,
        generationPrompt: assetVersions.generationPrompt,
      })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.sceneId, sceneId),
          eq(assetVersions.assetType, assetType),
          eq(assetVersions.isRejected, true)
        )
      );
    if (rejectedVersions.length > 0) {
      rejectionHistory = rejectedVersions
        .filter((r) => r.rejectionReason)
        .map((r) => `- Prompt: "${r.generationPrompt?.slice(0, 80) ?? "unknown"}"\n  Issues: ${r.rejectionReason}`)
        .join("\n");
    }
  } catch {
    // Rejection history optional
  }

  try {
    const refined = await refinePrompt({
      userPrompt: prompt,
      target,
      sceneDescription: scene.description ?? "",
      durationS: scene.targetClipDurationS ?? undefined,
      productContext: productContext || undefined,
      styleKnowledge: styleKnowledge || undefined,
      klingKnowledge: klingKnowledge || undefined,
      referenceFrameUrl,
      rejectionHistory: rejectionHistory || undefined,
    });

    return NextResponse.json({ refined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[refine-prompt]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
