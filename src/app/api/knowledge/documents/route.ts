import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments, knowledgeChunks } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { presignedGet } from "@/lib/r2";
import { extractText } from "@/lib/text-extraction";
import type { SupportedFileType } from "@/lib/text-extraction";
import { chunkText, embedBatch } from "@/lib/embeddings";

export async function GET() {
  const rows = await db
    .select()
    .from(knowledgeDocuments)
    .orderBy(desc(knowledgeDocuments.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, fileUrl, fileType } = body as {
    name: string;
    fileUrl: string;
    fileType: string;
  };

  if (!name || !fileUrl || !fileType) {
    return NextResponse.json(
      { error: "name, fileUrl, and fileType are required" },
      { status: 400 }
    );
  }

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({ name, fileUrl, fileType, status: "processing" })
    .returning();

  // Kick off extraction + embedding in the background.
  // setImmediate works on Railway's persistent Node.js process.
  setImmediate(() => {
    processDocument(doc.id, fileUrl, fileType as SupportedFileType).catch(
      async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[knowledge] processDocument ${doc.id} failed: ${msg}`);
        await db
          .update(knowledgeDocuments)
          .set({ status: "error" })
          .where(eq(knowledgeDocuments.id, doc.id));
      }
    );
  });

  return NextResponse.json(doc, { status: 201 });
}

async function processDocument(
  docId: string,
  fileUrl: string,
  fileType: SupportedFileType
) {
  console.log(`[knowledge] Processing document ${docId} (${fileType})`);

  // 1. Download from R2
  const downloadUrl = await presignedGet(fileUrl, 3600);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Extract text
  const text = await extractText(buffer, fileType);
  if (!text.trim()) throw new Error("No text extracted from document");

  // 3. Chunk
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("No chunks produced");

  // 4. Embed in batch
  const embeddings = await embedBatch(chunks);

  // 5. Insert chunks
  await db.insert(knowledgeChunks).values(
    chunks.map((content, i) => ({
      documentId: docId,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
    }))
  );

  // 6. Mark ready
  await db
    .update(knowledgeDocuments)
    .set({ status: "ready", totalChunks: chunks.length })
    .where(eq(knowledgeDocuments.id, docId));

  console.log(`[knowledge] Document ${docId} ready — ${chunks.length} chunks`);
}
