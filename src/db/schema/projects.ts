import {
  pgTable,
  uuid,
  text,
  integer,
  real,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: text("status").notNull().default("uploading"),
  // uploading | analyzing | manifest_review | producing | complete

  // Reference video
  referenceVideoUrl: text("reference_video_url"),
  referenceVideoDurationMs: integer("reference_video_duration_ms"),
  referenceFps: real("reference_fps"),
  totalFrames: integer("total_frames"),

  // AI analysis output (Step 2)
  aiAnalysis: jsonb("ai_analysis"),
  // { transcript, framework, visual_style, tone, target_audience }

  // Script variables (Step 3B)
  scriptAngle: text("script_angle"),
  scriptTonality: text("script_tonality"),
  scriptFormat: text("script_format"),
  fullScript: text("full_script"),
  scriptApproved: boolean("script_approved").default(false),

  // Kling element tags
  klingElementTags: text("kling_element_tags")
    .array()
    .default(sql`'{}'`),

  // Sub-stage tracking
  stage3aStatus: text("stage_3a_status").default("pending"),
  // pending | in_progress | approved
  stage3bStatus: text("stage_3b_status").default("pending"),
  stage3cStatus: text("stage_3c_status").default("pending"),

  createdAt: timestamp("created_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
