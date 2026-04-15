/**
 * Minimal document processor — chunks text, embeds via Voyage, inserts to DB.
 *
 * Usage: node scripts/process-document.mjs <docId> <textFilePath>
 *
 * Expects extracted text in a temp file. Only needs postgres + fetch (Voyage).
 * No S3 SDK, no pdftotext — the caller handles extraction.
 */

import { readFileSync, unlinkSync } from "fs";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env.local" });

const [docId, textPath] = process.argv.slice(2);
if (!docId || !textPath) {
  console.error("Usage: node scripts/process-document.mjs <docId> <textFilePath>");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 10 });

// ─── Chunking ───────────────────────────────────────────────────────────────

function chunkText(text, maxChars = 2800, overlapChars = 200) {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= maxChars) return cleaned.length > 50 ? [cleaned] : [];

  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = Math.min(start + maxChars, cleaned.length);
    if (end < cleaned.length) {
      const pb = cleaned.lastIndexOf("\n\n", end);
      const sb = cleaned.lastIndexOf(". ", end);
      const best = Math.max(pb, sb);
      if (best > start + overlapChars) end = best + 1;
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start = end - overlapChars;
    if (start <= 0) break;
  }
  return chunks;
}

// ─── Embedding ──────────────────────────────────────────────────────────────

async function embedBatch(texts) {
  const results = [];
  for (let i = 0; i < texts.length; i += 128) {
    const batch = texts.slice(i, i + 128).map(t => t.replace(/\n+/g, " ").trim());
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: batch, model: "voyage-3" }),
    });
    if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
    const json = await res.json();
    results.push(...json.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
  }
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

try {
  const text = readFileSync(textPath, "utf-8");
  console.log(`[process-doc] ${docId}: ${text.length} chars`);

  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("No chunks produced");
  console.log(`[process-doc] ${chunks.length} chunks`);

  const embeddings = await embedBatch(chunks);
  console.log(`[process-doc] Embedded`);

  for (let i = 0; i < chunks.length; i++) {
    const vec = `[${embeddings[i].join(",")}]`;
    await sql`
      INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding)
      VALUES (${docId}, ${i}, ${chunks[i]}, ${vec}::vector)
    `;
  }

  await sql`
    UPDATE knowledge_documents SET status = 'ready', total_chunks = ${chunks.length}, updated_at = NOW()
    WHERE id = ${docId}
  `;

  console.log(`[process-doc] Done — ${chunks.length} chunks`);
  await sql.end();
  process.exit(0);
} catch (err) {
  console.error(`[process-doc] Failed: ${err.message}`);
  try {
    await sql`UPDATE knowledge_documents SET status = 'error', updated_at = NOW() WHERE id = ${docId}`;
    await sql.end();
  } catch {}
  process.exit(1);
} finally {
  try { unlinkSync(textPath); } catch {}
}
