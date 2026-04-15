/**
 * POST /api/projects/[id]/chat
 * Body: { message: string, history: Array<{ role: "user" | "assistant", content: string }> }
 *
 * Creative collaborator chat — Claude sees all project scenes and helps
 * write/refine scripts, Kling prompts, and seed image prompts.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes, productProfiles, productImages } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { message, history } = (await req.json()) as {
    message: string;
    history: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Load project + scenes
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(asc(scenes.sceneOrder));

  // Build scene context
  const sceneContext = sceneRows.map((s) => {
    const prompt = s.scriptSegment ?? s.scenePrompt ?? "";
    return `Scene ${s.sceneOrder} (${(s.targetClipDurationS ?? 5).toFixed(1)}s):
  Description: ${s.description ?? "No description"}
  Kling Prompt: ${prompt || "Not set"}
  Seed Prompt: ${s.nanoBananaPrompt || "Not set"}`;
  }).join("\n\n");

  // Resolve product info from any @tags in scene prompts
  const allPromptText = sceneRows.map((s) => `${s.scriptSegment ?? ""} ${s.nanoBananaPrompt ?? ""}`).join(" ");
  const tagMatches = allPromptText.match(/@[\w-]+/g) ?? [];
  const uniqueTags = [...new Set(tagMatches)];
  let productContext = "";

  for (const tag of uniqueTags) {
    const slug = tag.slice(1);
    const [profile] = await db.select().from(productProfiles).where(eq(productProfiles.slug, slug));
    if (profile) {
      const images = await db.select().from(productImages).where(eq(productImages.productId, profile.id)).orderBy(asc(productImages.sortOrder));
      const labels = images.map((img) => img.label).filter(Boolean).join(", ");
      productContext += `\nProduct "${profile.name}" (${tag}): ${profile.description || "No description."}`;
      if (labels) productContext += ` | Image angles: ${labels}`;
    }
  }

  const systemPrompt = `You are a creative collaborator for a DTC video ad production pipeline. You help write and refine:
- Voiceover/talking-head scripts (the actual words spoken to camera)
- Kling video generation prompts (motion, camera movement, pacing — max 35 words, no backgrounds)
- Seed image prompts (full composition, lighting, subject pose for text-to-image generation)

**Current Project: "${project.name}"**
${project.fullScript ? `\nFull Script:\n${project.fullScript}` : ""}

**Scenes:**
${sceneContext}
${productContext ? `\n**Products:**${productContext}` : ""}

**Rules when writing prompts:**
- Kling prompts: max 35 words. Describe subject motion, camera movement, pacing. Do NOT describe backgrounds (seed image handles that). Use "subject" or "model", never demographics.
- Seed prompts: describe full scene composition, lighting, subject pose, wardrobe, setting, camera angle. Include "9:16 vertical portrait format".
- Script/dialogue: natural spoken words a real person would say to camera. Match brand voice.
- Preserve @product tags exactly (e.g. @airpplane-hoodie). These are system references — do not rewrite them.

When suggesting prompts or script lines, format them in code blocks so they're easy to copy. Always specify which scene a suggestion is for.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build messages from history + new message
  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return NextResponse.json({ reply: text });
}
