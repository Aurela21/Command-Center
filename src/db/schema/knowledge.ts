import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  customType,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// pgvector custom type — vector(1024) matches Voyage AI voyage-3 dims
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .map(Number);
  },
});

export const KNOWLEDGE_CATEGORIES = [
  "brand",
  "voice",
  "style",
  "script_copy",
  "kling_prompts",
  "product_assets",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull().default("brand"),
  fileUrl: text("file_url"),
  fileType: text("file_type"),
  // pdf | epub | txt | docx | jpg | png | webp
  totalChunks: integer("total_chunks").default(0),
  status: text("status").default("processing"),
  // processing | ready | error
  createdAt: timestamp("created_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
});

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    sectionTitle: text("section_title"),
    embedding: vector("embedding").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
  },
  (table) => [
    // ivfflat index must be created via raw SQL in a migration
    // Drizzle doesn't support ivfflat natively; see migrations for the index
    index("idx_chunks_document_id").on(table.documentId),
  ]
);

export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocuments.$inferInsert;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunks.$inferInsert;
