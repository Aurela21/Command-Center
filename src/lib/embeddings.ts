/**
 * OpenAI embeddings — text-embedding-3-small (1536 dims)
 *
 * Used exclusively for the knowledge base RAG pipeline:
 * - Embed document chunks at upload time
 * - Embed query at script generation time → cosine similarity search
 */

import OpenAI from "openai";

// Singleton
declare global {
  var _openai: OpenAI | undefined;
}

function getClient(): OpenAI {
  if (globalThis._openai) return globalThis._openai;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (process.env.NODE_ENV !== "production") globalThis._openai = client;
  return client;
}

const MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

// ─── Embed ───────────────────────────────────────────────────────────────────

/** Embed a single string. Returns a 1536-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: MODEL,
    input: text.replace(/\n+/g, " ").trim(),
    dimensions: EMBEDDING_DIMS,
  });
  return res.data[0].embedding;
}

/**
 * Embed multiple strings in one API call.
 * More efficient than calling embed() in a loop for bulk chunk processing.
 * OpenAI supports up to ~2048 inputs per request (we batch at 512 to be safe).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH = 512;
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) =>
      t.replace(/\n+/g, " ").trim()
    );
    const res = await getClient().embeddings.create({
      model: MODEL,
      input: slice,
      dimensions: EMBEDDING_DIMS,
    });
    // API returns results in the same order, but sort by index to be safe
    const sorted = res.data.sort((a, b) => a.index - b.index);
    all.push(...sorted.map((d) => d.embedding));
  }

  return all;
}

// ─── Chunking ────────────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks suitable for embedding.
 * Target: 500–700 tokens (~2000–2800 chars), 50-token (~200 char) overlap.
 */
export function chunkText(
  text: string,
  maxChars = 2800,
  overlapChars = 200
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= maxChars) return cleaned.length > 50 ? [cleaned] : [];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + maxChars, cleaned.length);

    // Prefer breaking at a paragraph or sentence boundary
    if (end < cleaned.length) {
      const paragraphBreak = cleaned.lastIndexOf("\n\n", end);
      const sentenceBreak = cleaned.lastIndexOf(". ", end);
      const best = Math.max(paragraphBreak, sentenceBreak);
      if (best > start + overlapChars) end = best + 1;
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);

    start = end - overlapChars;
    if (start <= 0) break;
  }

  return chunks;
}

// ─── Similarity ──────────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length vectors. Returns -1 to 1. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * In-process top-K similarity search over a pre-loaded chunk set.
 * For the knowledge base we use pgvector (DB-side), but this utility
 * is useful for small in-memory comparisons and testing.
 */
export function topK<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  k: number
): Array<T & { similarity: number }> {
  return items
    .map((item) => ({
      ...item,
      similarity: cosineSimilarity(query, item.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
