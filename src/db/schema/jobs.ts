import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { scenes } from "./scenes";
import { assetVersions } from "./asset-versions";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    sceneId: uuid("scene_id").references(() => scenes.id, {
      onDelete: "set null",
    }),

    jobType: text("job_type").notNull(),
    // video_analysis | frame_analysis | nano_banana | kling_generation
    status: text("status").notNull().default("queued"),
    // queued | submitted | processing | completed | failed | retrying

    externalJobId: text("external_job_id"),
    externalStatus: text("external_status"),

    attemptCount: integer("attempt_count").default(0),
    maxAttempts: integer("max_attempts").default(3),
    lastError: text("last_error"),

    progressPct: integer("progress_pct").default(0),
    etaSeconds: integer("eta_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    resultAssetVersionId: uuid("result_asset_version_id").references(
      () => assetVersions.id
    ),
    resultData: jsonb("result_data"),

    createdAt: timestamp("created_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(
      sql`NOW()`
    ),
  },
  (table) => [
    index("idx_jobs_active")
      .on(table.status)
      .where(
        sql`${table.status} IN ('queued', 'submitted', 'processing', 'retrying')`
      ),
  ]
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
