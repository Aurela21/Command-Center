import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productProfiles } from "./products";

export const staticAdJobs = pgTable("static_ad_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("uploading"),
  // statuses: uploading | analyzing | analyzed | confirmed | generating | completed | failed
  productId: uuid("product_id").references(() => productProfiles.id, {
    onDelete: "set null",
  }),
  inputImageUrl: text("input_image_url"),
  psychAnalysis: jsonb("psych_analysis"), // StaticAdAnalysis from claude.ts
  extractedCopy: jsonb("extracted_copy"), // { headline, body, cta }
  finalCopy: jsonb("final_copy"), // { headline, body, cta } — user-edited
  outputImageUrl: text("output_image_url"),
  outputFileSizeBytes: integer("output_file_size_bytes"),
  generationPrompt: text("generation_prompt"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
});

export type StaticAdJob = typeof staticAdJobs.$inferSelect;
export type NewStaticAdJob = typeof staticAdJobs.$inferInsert;
