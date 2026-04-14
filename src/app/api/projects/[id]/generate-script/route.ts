/**
 * POST /api/projects/[id]/generate-script
 * Body: { angle: string, tonality: string, format: string }
 *
 * Generates a full ad script + per-scene Kling prompts using Claude.
 * Searches the knowledge base for relevant brand/marketing context.
 * Saves the script and prompts back to the DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { embed } from "@/lib/embeddings";
import { generateScript } from "@/lib/claude";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { angle, tonality, format } = await req.json() as {
    angle: string;
    tonality: string;
    format: string;
  };

  // 1. Load project + scenes
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(asc(scenes.sceneOrder));

  if (sceneRows.length === 0) {
    return NextResponse.json({ error: "No scenes found" }, { status: 400 });
  }

  // 2. Search knowledge base for relevant context
  let knowledgeChunks: Array<{ content: string; sectionTitle?: string | null }> = [];
  try {
    const query = `${project.name} ${angle} ${tonality} ${format} video ad script`;
    const queryEmbedding = await embed(query);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const rows = await db.execute<{
      content: string;
      section_title: string | null;
      similarity: number;
    }>(sql`
      SELECT kc.content, kc.section_title,
        (1 - (kc.embedding <=> ${embeddingStr}::vector))::float AS similarity
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kc.document_id = kd.id
      WHERE kd.status = 'ready'
      ORDER BY kc.embedding <=> ${embeddingStr}::vector
      LIMIT 5
    `);

    knowledgeChunks = rows.map((r) => ({
      content: r.content,
      sectionTitle: r.section_title,
    }));
  } catch {
    // Knowledge base is optional — proceed without it
    console.log("[generate-script] Knowledge base search skipped (no docs or error)");
  }

  // 3. Generate script via Claude
  const result = await generateScript({
    projectName: project.name,
    scenes: sceneRows.map((s) => ({
      order: s.sceneOrder,
      description: s.description ?? "",
      durationMs: s.endTimeMs - s.startTimeMs,
    })),
    analysis: null, // could pass project.aiAnalysis if available
    angle,
    tonality,
    format,
    klingElementTags: (project.klingElementTags as string[]) ?? [],
    knowledgeChunks,
  });

  // 4. Save script to project
  await db
    .update(projects)
    .set({
      fullScript: result.fullScript,
      scriptAngle: angle,
      scriptTonality: tonality,
      scriptFormat: format,
      updatedAt: sql`NOW()`,
    })
    .where(eq(projects.id, projectId));

  // 5. Save per-scene prompts to scenes
  for (let i = 0; i < sceneRows.length; i++) {
    const prompt = result.sceneSegments[i] ?? "";
    if (prompt) {
      await db
        .update(scenes)
        .set({ scriptSegment: prompt, updatedAt: sql`NOW()` })
        .where(eq(scenes.id, sceneRows[i].id));
    }
  }

  return NextResponse.json({
    fullScript: result.fullScript,
    sceneSegments: result.sceneSegments,
  });
}
