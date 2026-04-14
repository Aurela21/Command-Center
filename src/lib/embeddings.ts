/**
 * Voyage AI embeddings — voyage-3 (1024 dims)
 *
 * Used exclusively for the knowledge base RAG pipeline:
 * - Embed document chunks at upload time
 * - Embed query at search time → cosine similarity search via pgvector
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
export const EMBEDDING_DIMS = 1024;

async function voyageFetch(inputs: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: inputs, model: MODEL }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voyage API ${res.status}: ${text}`);
  }

  const json = await res.json() as { data: Array<{ index: number; embedding: number[] }> };
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Embed a single string. Returns a 1024-dim vector. */
export async function embed(text: string): Promise<number[]> {
  const results = await voyageFetch([text.replace(/\n+/g, " ").trim()]);
  return results[0];
}

/**
 * Embed multiple strings in batches.
 * Voyage supports up to 128 inputs per request.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const BATCH = 128;
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) =>
      t.replace(/\n+/g, " ").trim()
    );
    const results = await voyageFetch(slice);
    all.push(...results);
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
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function topK<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  k: number
): Array<T & { similarity: number }> {
  return items
    .map((item) => ({ ...item, similarity: cosineSimilarity(query, item.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
