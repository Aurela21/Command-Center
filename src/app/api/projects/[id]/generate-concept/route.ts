/**
 * POST /api/projects/[id]/generate-concept
 * Body: { concept: string }
 *
 * Takes a freeform concept description and uses Claude to generate
 * a scene breakdown with descriptions, durations, and Kling prompts.
 * Creates scene records in the DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes, productProfiles, productImages } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { concept } = (await req.json()) as { concept: string };

  if (!concept?.trim()) {
    return NextResponse.json({ error: "concept is required" }, { status: 400 });
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Resolve any @product tags in the concept for context
  const tagMatches = concept.match(/@[\w-]+/g) ?? [];
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
      const labels = images.map((img) => img.label).filter(Boolean).join(", ");
      productContext += `\n\nProduct "${profile.name}" (${tag}): ${profile.description || "No description."}`;
      if (labels) productContext += `\nProduct image angles: ${labels}`;
    }
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a DTC video ad creative director. Break this concept into a scene-by-scene production plan.

CONCEPT:
${concept}
${productContext ? `\nPRODUCT CONTEXT:${productContext}` : ""}

Generate 5-10 scenes that tell a compelling story. For each scene provide:
- sceneOrder (1-based)
- description: 1-2 sentences of what happens visually
- targetClipDurationS: duration in seconds (3.0-7.0, total should be 15-45s)
- klingPrompt: a precise Kling video generation prompt (max 35 words) describing subject motion, camera movement, and pacing. Do NOT describe backgrounds — those come from the seed image. Refer to the subject as "subject" or "model", never demographics.
- seedPrompt: a text-to-image prompt for generating the starting frame from scratch (describe the full scene composition, lighting, subject pose, wardrobe, setting, camera angle). Include "9:16 vertical portrait format" in each seed prompt.

IMPORTANT: If the concept mentions @product tags (e.g. @airpplane-hoodie), include those exact @tags in BOTH the klingPrompt and seedPrompt for every scene where the product appears. These tags are system references that resolve to product images during generation — do NOT rewrite them as plain text, do NOT remove the @ prefix, do NOT change the tag name.

Return ONLY valid JSON:
{
  "scenes": [
    {
      "sceneOrder": 1,
      "description": "...",
      "targetClipDurationS": 5.0,
      "klingPrompt": "...",
      "seedPrompt": "..."
    }
  ],
  "totalDurationS": 30,
  "suggestedTone": "...",
  "suggestedAngle": "..."
}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonMatch) {
    return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
  }

  const result = JSON.parse(jsonMatch) as {
    scenes: Array<{
      sceneOrder: number;
      description: string;
      targetClipDurationS: number;
      klingPrompt: string;
      seedPrompt: string;
    }>;
    totalDurationS?: number;
    suggestedTone?: string;
    suggestedAngle?: string;
  };

  // Delete existing scenes for this project (in case of re-generation)
  await db.delete(scenes).where(eq(scenes.projectId, projectId));

  // Create scene records
  const sceneValues = result.scenes.map((s) => ({
    projectId,
    sceneOrder: s.sceneOrder,
    startFrame: 0,
    endFrame: 0,
    startTimeMs: 0,
    endTimeMs: Math.round(s.targetClipDurationS * 1000),
    referenceFrame: 0,
    description: s.description,
    scenePrompt: s.klingPrompt,
    scriptSegment: s.klingPrompt,
    nanoBananaPrompt: s.seedPrompt,
    targetClipDurationS: Math.min(Math.max(s.targetClipDurationS, 3.0), 10.0),
    boundarySource: "ai" as const,
  }));

  await db.insert(scenes).values(sceneValues);

  // Update project status
  await db
    .update(projects)
    .set({ status: "concept_setup", updatedAt: sql`NOW()` })
    .where(eq(projects.id, projectId));

  console.log(`[generate-concept] Created ${result.scenes.length} scenes for project ${projectId}`);

  return NextResponse.json({
    scenesCreated: result.scenes.length,
    scenes: result.scenes,
    totalDurationS: result.totalDurationS,
    suggestedTone: result.suggestedTone,
    suggestedAngle: result.suggestedAngle,
  });
}
