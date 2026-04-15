import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments, knowledgeChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { spawn } from "child_process";
import { resolve } from "path";

type Params = { params: Promise<{ id: string }> };

// POST /api/knowledge/documents/:id/process
// Retriggers processing for a document that errored or needs re-embedding.
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id));

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!doc.fileUrl) {
    return NextResponse.json({ error: "No file URL on document" }, { status: 422 });
  }
  if (!doc.fileType) {
    return NextResponse.json({ error: "Unknown file type" }, { status: 422 });
  }

  // Reset to processing state
  await db
    .update(knowledgeDocuments)
    .set({ status: "processing", totalChunks: 0 })
    .where(eq(knowledgeDocuments.id, id));

  // Delete existing chunks before re-processing
  await db
    .delete(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, id));

  // Spawn subprocess
  const scriptPath = resolve(process.cwd(), "scripts/process-document.mjs");
  const child = spawn("node", ["--max-old-space-size=1024", scriptPath, id, doc.fileUrl, doc.fileType], {
    stdio: "inherit",
    detached: true,
    env: { ...process.env },
  });
  child.unref();
  console.log(`[knowledge/process] Spawned processor for ${id} (pid ${child.pid})`);

  return NextResponse.json({ status: "processing" });
}
