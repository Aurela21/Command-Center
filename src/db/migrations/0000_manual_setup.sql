-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add generated column for scene duration (Drizzle doesn't support GENERATED ALWAYS AS ... STORED)
-- Run this after db:push creates the scenes table
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER
  GENERATED ALWAYS AS (end_time_ms - start_time_ms) STORED;

-- ivfflat index for cosine similarity search on embeddings
-- Run after knowledge_chunks table is created
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);
