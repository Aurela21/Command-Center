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
  projectType: text("project_type").notNull().default("reference"),
  // reference | concept
  status: text("status").notNull().default("uploading"),
  // uploading | analyzing | manifest_review | producing | complete | concept_setup

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

  // Hero model image (base model + setting, used as reference for all scene seeds)
  heroSourceFrame: integer("hero_source_frame"),
  heroImages: jsonb("hero_images"),
  // [{ id, url, prompt, sourceFrame, createdAt }]
  approvedHeroUrl: text("approved_hero_url"),

  // Voice-over (ElevenLabs)
  voiceoverId: text("voiceover_id"),
  voiceoverName: text("voiceover_name"),
  voiceoverUrl: text("voiceover_url"),
  voiceoverSpeed: real("voiceover_speed").default(1.0),
  voiceoverMatchPacing: boolean("voiceover_match_pacing").default(false),
  voiceoverHistory: jsonb("voiceover_history"),
  // [{ id, url, voiceId, voiceName, speed, matchedPacing, durationMs, createdAt }]

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
