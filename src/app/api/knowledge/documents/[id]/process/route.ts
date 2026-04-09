import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments, knowledgeChunks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { presignedGet } from "@/lib/r2";
import { extractText } from "@/lib/text-extraction";
import type { SupportedFileType } from "@/lib/text-extraction";
import { chunkText, embedBatch } from "@/lib/embeddings";

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

  const fileType = doc.fileType as SupportedFileType | null;
  if (!fileType) {
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

  setImmediate(() => {
    runProcess(id, doc.fileUrl!, fileType).catch(async (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[knowledge/process] ${id} failed: ${msg}`);
      await db
        .update(knowledgeDocuments)
        .set({ status: "error" })
        .where(eq(knowledgeDocuments.id, id));
    });
  });

  return NextResponse.json({ status: "processing" });
}

async function runProcess(docId: string, fileUrl: string, fileType: SupportedFileType) {
  const downloadUrl = await presignedGet(fileUrl, 3600);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const text = await extractText(buffer, fileType);
  if (!text.trim()) throw new Error("No text extracted");

  const chunks = chunkText(text);
  const embeddings = await embedBatch(chunks);

  await db.insert(knowledgeChunks).values(
    chunks.map((content, i) => ({
      documentId: docId,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
    }))
  );

  await db
    .update(knowledgeDocuments)
    .set({ status: "ready", totalChunks: chunks.length })
    .where(eq(knowledgeDocuments.id, docId));

  console.log(`[knowledge/process] ${docId} ready — ${chunks.length} chunks`);
}
