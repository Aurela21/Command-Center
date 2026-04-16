import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productProfiles } from "./products";

export const productLearnings = pgTable("product_learnings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id")
    .references(() => productProfiles.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(), // "positive" | "negative"
  source: text("source").notNull(), // "seed_image" | "kling_video" | "static_ad"
  sourceId: text("source_id"), // asset_version ID or static_ad_generation ID
  learning: text("learning").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(
    sql`NOW()`
  ),
});

export type ProductLearning = typeof productLearnings.$inferSelect;
export type NewProductLearning = typeof productLearnings.$inferInsert;
