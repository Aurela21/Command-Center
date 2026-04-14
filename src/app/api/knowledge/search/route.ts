import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { embed } from "@/lib/embeddings";
import { sql } from "drizzle-orm";

export type SearchResult = {
  id: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  sectionTitle: string | null;
  similarity: number;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, topK = 8, category, categories } = body as {
    query: string;
    topK?: number;
    category?: string;      // filter to a single category
    categories?: string[];  // filter to multiple categories
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Embed the query
  const queryEmbedding = await embed(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Build category filter
  const catList = categories ?? (category ? [category] : null);
  const categoryFilter = catList
    ? sql`AND kd.category = ANY(${catList}::text[])`
    : sql``;

  // pgvector cosine distance search — lower distance = higher similarity
  // 1 - cosine_distance = cosine_similarity
  const rows = await db.execute<{
    id: string;
    document_id: string;
    document_name: string;
    chunk_index: number;
    content: string;
    section_title: string | null;
    similarity: number;
  }>(sql`
    SELECT
      kc.id,
      kc.document_id,
      kd.name AS document_name,
      kc.chunk_index,
      kc.content,
      kc.section_title,
      (1 - (kc.embedding <=> ${embeddingStr}::vector))::float AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kc.document_id = kd.id
    WHERE kd.status = 'ready'
    ${categoryFilter}
    ORDER BY kc.embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  const results: SearchResult[] = rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    chunkIndex: r.chunk_index,
    content: r.content,
    sectionTitle: r.section_title,
    similarity: r.similarity,
  }));

  return NextResponse.json(results);
}
