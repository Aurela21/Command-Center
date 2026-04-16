import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staticAdJobs } from "./static-ad-jobs";

export const staticAdGenerations = pgTable(
  "static_ad_generations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    jobId: uuid("job_id")
      .references(() => staticAdJobs.id, { onDelete: "cascade" })
      .notNull(),
    versionNumber: integer("version_number").notNull(),
    imageUrl: text("image_url").notNull(),
    referenceImageUrl: text("reference_image_url"),
    fileSizeBytes: integer("file_size_bytes"),
    generationPrompt: text("generation_prompt"),
    editPrompt: text("edit_prompt"),
    isFavorite: boolean("is_favorite").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
  },
  (table) => [
    unique("static_ad_generations_job_version_unique").on(
      table.jobId,
      table.versionNumber
    ),
  ]
);

export type StaticAdGeneration = typeof staticAdGenerations.$inferSelect;
export type NewStaticAdGeneration = typeof staticAdGenerations.$inferInsert;
