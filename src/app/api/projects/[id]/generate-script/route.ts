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
import type { VideoAnalysis } from "@/lib/claude";

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

    // Try chunks first, fall back to raw_text on documents
    const [scriptChunkRows, klingChunkRows] = await Promise.all([
      db.execute<{ content: string; section_title: string | null; similarity: number }>(sql`
        SELECT kc.content, kc.section_title, 0.5::float AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = ANY(${scriptCategories}::text[])
        ORDER BY CASE WHEN kc.embedding IS NOT NULL THEN kc.embedding <=> ${scriptEmbStr}::vector ELSE 1 END, kc.chunk_index
        LIMIT 5
      `),
      db.execute<{ content: string; section_title: string | null; similarity: number }>(sql`
        SELECT kc.content, kc.section_title, 0.5::float AS similarity
        FROM knowledge_chunks kc
        JOIN knowledge_documents kd ON kc.document_id = kd.id
        WHERE kd.status = 'ready' AND kd.category = ANY(${klingCategories}::text[])
        ORDER BY CASE WHEN kc.embedding IS NOT NULL THEN kc.embedding <=> ${klingEmbStr}::vector ELSE 1 END, kc.chunk_index
        LIMIT 5
      `),
    ]);

    type KRow = { content: string; section_title: string | null; similarity: number };
    let scriptRowsFinal: KRow[] = [...scriptChunkRows];
    let klingRowsFinal: KRow[] = [...klingChunkRows];

    // Fall back to raw_text on documents if no chunks
    if (scriptRowsFinal.length === 0) {
      const docRows = await db.execute<{ raw_text: string; name: string }>(sql`
        SELECT raw_text, name FROM knowledge_documents
        WHERE status = 'ready' AND category = ANY(${scriptCategories}::text[]) AND raw_text IS NOT NULL
        LIMIT 5
      `);
      scriptRowsFinal = docRows.map((r) => ({ content: r.raw_text, section_title: r.name, similarity: 0.5 }));
    }
    if (klingRowsFinal.length === 0) {
      const docRows = await db.execute<{ raw_text: string; name: string }>(sql`
        SELECT raw_text, name FROM knowledge_documents
        WHERE status = 'ready' AND category = ANY(${klingCategories}::text[]) AND raw_text IS NOT NULL
        LIMIT 5
      `);
      klingRowsFinal = docRows.map((r) => ({ content: r.raw_text, section_title: r.name, similarity: 0.5 }));
    }

    scriptKnowledge = scriptRowsFinal.map((r) => ({ content: r.content, sectionTitle: r.section_title }));
    klingKnowledge = klingRowsFinal.map((r) => ({ content: r.content, sectionTitle: r.section_title }));
  } catch {
    console.log("[generate-script] Knowledge base search skipped (no docs or error)");
  }

  // Merge both sets for the Claude prompt — label them so Claude knows which is which
  const knowledgeChunks = [
    ...scriptKnowledge.map((c) => ({ ...c, source: "script" as const })),
    ...klingKnowledge.map((c) => ({ ...c, source: "kling" as const })),
  ];

  // 3. Generate script via Claude
  const R2_PUBLIC = process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

  const result = await generateScript({
    projectName: project.name,
    scenes: sceneRows.map((s) => {
      // Build reference frame URL
      let frameUrl = s.referenceFrameUrl;
      if (!frameUrl && R2_PUBLIC) {
        const idx = s.referenceFrame < 20 ? s.referenceFrame : Math.round(s.referenceFrame / 30);
        frameUrl = `${R2_PUBLIC}/frames/${projectId}/f${String(idx).padStart(4, "0")}.jpg`;
      }
      return {
        order: s.sceneOrder,
        description: s.description ?? "",
        durationMs: s.endTimeMs - s.startTimeMs,
        referenceFrameUrl: frameUrl ?? undefined,
        originalKlingPrompt: s.scenePrompt ?? undefined,
      };
    }),
    analysis: (project.aiAnalysis as VideoAnalysis) ?? null,
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
