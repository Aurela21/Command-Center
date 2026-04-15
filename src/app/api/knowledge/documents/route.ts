import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { presignedGet } from "@/lib/r2";
import { extractText } from "@/lib/text-extraction";
import type { SupportedFileType } from "@/lib/text-extraction";

export const maxDuration = 120;

export async function GET() {
  const rows = await db
    .select()
    .from(knowledgeDocuments)
    .orderBy(desc(knowledgeDocuments.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, fileUrl, fileType, category } = body as {
    name: string;
    fileUrl: string;
    fileType: string;
    category?: string;
  };

  if (!name || !fileUrl || !fileType) {
    return NextResponse.json(
      { error: "name, fileUrl, and fileType are required" },
      { status: 400 }
    );
  }

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({ name, fileUrl, fileType, category: category ?? "brand", status: "processing" })
    .returning();

  // Images skip text processing
  if ((fileType as string) === "image") {
    await db
      .update(knowledgeDocuments)
      .set({ status: "ready", totalChunks: 0 })
      .where(eq(knowledgeDocuments.id, doc.id));
    return NextResponse.json({ ...doc, status: "ready", totalChunks: 0 }, { status: 201 });
  }

  try {
    // Download from R2
    const downloadUrl = await presignedGet(fileUrl, 3600);
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`R2 download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Extract text (pdftotext for PDFs — native binary, zero JS memory)
    const text = await extractText(buffer, fileType as SupportedFileType);
    console.log(`[knowledge] Extracted ${text.length} chars from ${doc.id}`);

    // Store raw text directly on the document via raw SQL.
    // This adds a raw_text column if it doesn't exist (idempotent),
    // then stores the text. No chunking, no embedding, no extra memory.
    await db.execute(sql`
      ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS raw_text text
    `);
    await db.execute(sql`
      UPDATE knowledge_documents
      SET raw_text = ${text}, status = 'ready', total_chunks = 1
      WHERE id = ${doc.id}
    `);

    console.log(`[knowledge] ${doc.id} ready — ${text.length} chars stored`);
    return NextResponse.json({ ...doc, status: "ready", totalChunks: 1 }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[knowledge] ${doc.id} failed: ${msg}`);
    await db
      .update(knowledgeDocuments)
      .set({ status: "error" })
      .where(eq(knowledgeDocuments.id, doc.id))
      .catch(() => {});
    return NextResponse.json({ ...doc, status: "error" }, { status: 201 });
  }
}
