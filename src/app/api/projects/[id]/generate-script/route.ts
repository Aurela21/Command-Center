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
  //    Voiceover script pulls from: brand, voice, script_copy
  //    Kling prompts pull from: kling_prompts, style
  let scriptKnowledge: Array<{ content: string; sectionTitle?: string | null }> = [];
  let klingKnowledge: Array<{ content: string; sectionTitle?: string | null }> = [];

  try {
    const scriptQuery = `${project.name} ${angle} ${tonality} ${format} video ad script voiceover copy`;
    const klingQuery = `kling video generation prompt ${format} visual motion camera`;

    const scriptEmbedding = await embed(scriptQuery);
    const klingEmbedding = await embed(klingQuery);
    const scriptEmbStr = `[${scriptEmbedding.join(",")}]`;
    const klingEmbStr = `[${klingEmbedding.join(",")}]`;

    const scriptCategories = ["brand", "voice", "script_copy"];
    const klingCategories = ["kling_prompts", "style"];

    const [scriptRows, klingRows] = await Promise.all([
      db.execute<{ content: string; section_title: string | null; similarity: number }>(sql`
        SELECT kc.content, kc.section_title,
          (1 - (kc.embedding <=> ${scriptEmbStr}::vector))::float AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = ANY(${scriptCategories}::text[])
        ORDER BY kc.embedding <=> ${scriptEmbStr}::vector
        LIMIT 5
      `),
      db.execute<{ content: string; section_title: string | null; similarity: number }>(sql`
        SELECT kc.content, kc.section_title,
          (1 - (kc.embedding <=> ${klingEmbStr}::vector))::float AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = ANY(${klingCategories}::text[])
        ORDER BY kc.embedding <=> ${klingEmbStr}::vector
        LIMIT 5
      `),
    ]);

    scriptKnowledge = scriptRows.map((r) => ({ content: r.content, sectionTitle: r.section_title }));
    klingKnowledge = klingRows.map((r) => ({ content: r.content, sectionTitle: r.section_title }));
  } catch {
    console.log("[generate-script] Knowledge base search skipped (no docs or error)");
  }

  // Merge both sets for the Claude prompt — label them so Claude knows which is which
  const knowledgeChunks = [
    ...scriptKnowledge.map((c) => ({ ...c, source: "script" as const })),
    ...klingKnowledge.map((c) => ({ ...c, source: "kling" as const })),
  ];

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
