import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  boolean,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    sceneOrder: integer("scene_order").notNull(),

    // Boundary definition (frame-precise)
    startFrame: integer("start_frame").notNull(),
    endFrame: integer("end_frame").notNull(),
    startTimeMs: integer("start_time_ms").notNull(),
    endTimeMs: integer("end_time_ms").notNull(),
    // duration_ms is a generated column — handled in migration SQL directly

    // Reference frame
    referenceFrame: integer("reference_frame").notNull(),
    referenceFrameUrl: text("reference_frame_url"),
    referenceFrameSource: text("reference_frame_source").default("auto"),
    // auto | user_selected

    // Boundary source
    boundarySource: text("boundary_source").default("ai"),
    // ai | user_adjusted | user_created

    // Content descriptions
    description: text("description"),
    scenePrompt: text("scene_prompt"),
    scriptSegment: text("script_segment"),

    // Start frame analysis
    startFrameUrl: text("start_frame_url"),
    startFrameAnalysis: jsonb("start_frame_analysis"),

    // Nano Banana
    nanoBananaPrompt: text("nano_banana_prompt"),

    // Approved asset IDs
    approvedSeedImageId: uuid("approved_seed_image_id"),
    approvedKlingOutputId: uuid("approved_kling_output_id"),

    // Per-scene approval states
    seedImageApproved: boolean("seed_image_approved").default(false),
    klingPromptApproved: boolean("kling_prompt_approved").default(false),
    klingOutputApproved: boolean("kling_output_approved").default(false),

    // Kling constraints
    targetClipDurationS: real("target_clip_duration_s").default(5.0),

    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
  },
  (table) => [
    unique("scenes_project_id_scene_order_unique").on(
      table.projectId,
      table.sceneOrder
    ),
    check(
      "target_clip_duration_check",
      sql`${table.targetClipDurationS} BETWEEN 3.0 AND 15.0`
    ),
  ]
);

export type Scene = typeof scenes.$inferSelect;
export type NewScene = typeof scenes.$inferInsert;
