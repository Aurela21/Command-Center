import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { knowledgeDocuments, knowledgeChunks } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id));

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const chunks = await db
    .select({
      id: knowledgeChunks.id,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      sectionTitle: knowledgeChunks.sectionTitle,
    })
    .from(knowledgeChunks)
    .where(eq(knowledgeChunks.documentId, id));

  return NextResponse.json({ ...doc, chunks });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [deleted] = await db
    .delete(knowledgeDocuments)
    .where(eq(knowledgeDocuments.id, id))
    .returning();

  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
