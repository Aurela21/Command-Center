import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const productProfiles = pgTable("product_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // display name: "Airplane Hoodie"
  slug: text("slug").notNull().unique(), // @tag name: "airplane-hoodie"
  description: text("description").default(""),
  imageCount: integer("image_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`NOW()`),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id")
    .references(() => productProfiles.id, { onDelete: "cascade" })
    .notNull(),
  fileUrl: text("file_url").notNull(), // R2 key or public URL
  label: text("label").notNull().default("unlabeled"), // "front-full-body", "eye-mask-detail", etc.
  autoLabeled: text("auto_labeled"), // what Claude Vision originally suggested
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`NOW()`),
});

export type ProductProfile = typeof productProfiles.$inferSelect;
export type NewProductProfile = typeof productProfiles.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
