/**
 * POST /api/projects/[id]/chat
 * Body: { message: string, sessionId?: string }
 *
 * Sends a message to the creative AI collaborator.
 * If sessionId is provided, continues an existing chat.
 * If not, creates a new session.
 * Messages are persisted to the chat_sessions table.
 *
 * GET /api/projects/[id]/chat
 * Returns all chat sessions for the project (most recent first).
 *
 * DELETE /api/projects/[id]/chat?sessionId=xxx
 * Deletes a chat session.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes, chatSessions, productProfiles, productImages } from "@/db/schema";
import { eq, asc, desc, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };
type MediaAttachment = { type: "image" | "video"; mimeType: string; base64: string; name: string };
type ChatMessage = { role: "user" | "assistant"; content: string; media?: MediaAttachment[] };

export const runtime = "nodejs";
export const maxDuration = 60;

// ─── GET: List chat sessions ─────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const sessions = await db
    .select({ id: chatSessions.id, title: chatSessions.title, createdAt: chatSessions.createdAt, updatedAt: chatSessions.updatedAt })
    .from(chatSessions)
    .where(eq(chatSessions.projectId, projectId))
    .orderBy(desc(chatSessions.updatedAt));
  return NextResponse.json(sessions);
}

// ─── POST: Send message ──────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { message, sessionId, media } = (await req.json()) as {
    message: string;
    sessionId?: string;
    media?: MediaAttachment[];
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Load or create session
  let session: { id: string; messages: ChatMessage[] };

  if (sessionId) {
    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId));
    if (!existing) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    session = { id: existing.id, messages: (existing.messages as ChatMessage[]) ?? [] };
  } else {
    // Create new session with first message as title
    const title = message.trim().slice(0, 60) + (message.length > 60 ? "…" : "");
    const [created] = await db
      .insert(chatSessions)
      .values({ projectId, title, messages: [] as unknown as Record<string, unknown>[] })
      .returning();
    session = { id: created.id, messages: [] };
  }

  // Build system prompt with project context
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(asc(scenes.sceneOrder));

  const sceneContext = sceneRows.map((s) => {
    const prompt = s.scriptSegment ?? s.scenePrompt ?? "";
    return `Scene ${s.sceneOrder} (${(s.targetClipDurationS ?? 5).toFixed(1)}s):
  Description: ${s.description ?? "No description"}
  Kling Prompt: ${prompt || "Not set"}
  Seed Prompt: ${s.nanoBananaPrompt || "Not set"}`;
  }).join("\n\n");

  // Resolve product info
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

**Current Project: "${project?.name ?? "Unknown"}"**
${project?.fullScript ? `\nFull Script:\n${project.fullScript}` : ""}

**Scenes:**
${sceneContext}
${productContext ? `\n**Products:**${productContext}` : ""}

**Rules when writing prompts:**
- Kling prompts: max 35 words. Describe subject motion, camera movement, pacing. Do NOT describe backgrounds. Use "subject" or "model", never demographics.
- Seed prompts: describe full scene composition, lighting, subject pose, wardrobe, setting, camera angle. Include "9:16 vertical portrait format".
- Script/dialogue: natural spoken words a real person would say to camera. Match brand voice.
- Preserve @product tags exactly (e.g. @airpplane-hoodie).

When suggesting prompts or script lines, format them in code blocks so they're easy to copy. Always specify which scene a suggestion is for.`;

  // Add user message to history (store media metadata but not full base64 for DB)
  const userMsg: ChatMessage = {
    role: "user",
    content: message,
    ...(media?.length ? { media: media.map((m) => ({ ...m, base64: "" })) } : {}),
  };
  const updatedMessages: ChatMessage[] = [...session.messages, userMsg];

  // Build Claude messages — convert media to vision inputs for the current message
  const claudeMessages: Anthropic.MessageParam[] = updatedMessages.map((m) => {
    // For past messages or assistant messages, just send text
    if (m.role === "assistant" || m !== userMsg) {
      return { role: m.role as "user" | "assistant", content: m.content };
    }
    // For the current user message with media, build multimodal content
    const parts: Anthropic.ContentBlockParam[] = [];
    if (media?.length) {
      for (const att of media) {
        if (att.type === "image") {
          parts.push({
            type: "image",
            source: { type: "base64", media_type: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: att.base64 },
          });
        }
        // For video, extract a note — Claude can't process video directly
        if (att.type === "video") {
          parts.push({ type: "text", text: `[User attached a video file: ${att.name}]` });
        }
      }
    }
    parts.push({ type: "text", text: m.content });
    return { role: "user" as const, content: parts };
  });

  // Call Claude
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: claudeMessages,
  });

  const reply = response.content[0].type === "text" ? response.content[0].text : "";

  // Save messages to DB (media stored without base64 to keep DB small)
  const allMessages: ChatMessage[] = [...updatedMessages, { role: "assistant", content: reply }];
  await db
    .update(chatSessions)
    .set({
      messages: allMessages as unknown as Record<string, unknown>[],
      updatedAt: sql`NOW()`,
    })
    .where(eq(chatSessions.id, session.id));

  return NextResponse.json({
    reply,
    sessionId: session.id,
    messages: allMessages,
  });
}

// ─── DELETE: Remove a session ────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  return NextResponse.json({ deleted: true });
}
