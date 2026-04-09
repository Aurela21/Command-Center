import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { scenes } from "./scenes";

export const assetVersions = pgTable(
  "asset_versions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sceneId: uuid("scene_id")
      .references(() => scenes.id, { onDelete: "cascade" })
      .notNull(),
    assetType: text("asset_type").notNull(),
    // seed_image | kling_output
    versionNumber: integer("version_number").notNull(),

    fileUrl: text("file_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    fileSizeBytes: integer("file_size_bytes"),
    durationMs: integer("duration_ms"),
    // for kling_output only

    generationPrompt: text("generation_prompt"),
    generationConfig: jsonb("generation_config"),

    qualityScore: jsonb("quality_score"),
    // { overall: 0-100, breakdown: { prompt_adherence, visual_fidelity, ... } }

    isApproved: boolean("is_approved").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
  },
  (table) => [
    unique("asset_versions_scene_type_version_unique").on(
      table.sceneId,
      table.assetType,
      table.versionNumber
    ),
  ]
);

export type AssetVersion = typeof assetVersions.$inferSelect;
export type NewAssetVersion = typeof assetVersions.$inferInsert;
