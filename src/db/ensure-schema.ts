/**
 * Auto-add columns that were added after the initial migration.
 * Call `await ensureSchema()` at the top of any API route that
 * queries `projects` or `scenes` with the full Drizzle schema.
 *
 * Uses a module-level flag so the ALTER TABLE only runs once
 * per server lifetime, on the first request to hit any route.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

let checked = false;

export async function ensureSchema() {
  if (checked) return;
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS hero_source_frame INTEGER,
        ADD COLUMN IF NOT EXISTS hero_images JSONB,
        ADD COLUMN IF NOT EXISTS approved_hero_url TEXT,
        ADD COLUMN IF NOT EXISTS voiceover_id TEXT,
        ADD COLUMN IF NOT EXISTS voiceover_name TEXT,
        ADD COLUMN IF NOT EXISTS voiceover_url TEXT,
        ADD COLUMN IF NOT EXISTS voiceover_speed REAL DEFAULT 1.0,
        ADD COLUMN IF NOT EXISTS voiceover_match_pacing BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS voiceover_history JSONB;
      ALTER TABLE scenes
        ADD COLUMN IF NOT EXISTS end_frame_url TEXT,
        ADD COLUMN IF NOT EXISTS end_frame_prompt TEXT,
        ADD COLUMN IF NOT EXISTS seed_skipped BOOLEAN DEFAULT FALSE;
    `);
  } catch {
    // Columns already exist
  }
  checked = true;
}
