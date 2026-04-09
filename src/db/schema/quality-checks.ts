import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { assetVersions } from "./asset-versions";

export const qualityChecks = pgTable("quality_checks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  assetVersionId: uuid("asset_version_id")
    .references(() => assetVersions.id, { onDelete: "cascade" })
    .notNull(),
  checkType: text("check_type").notNull(),
  // prompt_adherence | visual_fidelity | reference_match
  // | duration_compliance | motion_quality | lip_sync_risk
  score: integer("score").notNull(),
  // 0-100
  details: jsonb("details"),
  flagged: boolean("flagged").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
});

export type QualityCheck = typeof qualityChecks.$inferSelect;
export type NewQualityCheck = typeof qualityChecks.$inferInsert;
