/**
 * Next.js instrumentation hook — runs once on server startup.
 * Used to start the background cron job poller.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only start cron in the Node.js runtime (not Edge).
  // This also guards against double-start in dev (fast refresh).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronPoller } = await import("./lib/cron");
    startCronPoller();

    // Ensure all schema columns exist (avoids formal migrations)
    try {
      const { db } = await import("@/db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`
        ALTER TABLE projects
          ADD COLUMN IF NOT EXISTS hero_source_frame INTEGER,
          ADD COLUMN IF NOT EXISTS hero_images JSONB,
          ADD COLUMN IF NOT EXISTS approved_hero_url TEXT,
          ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'reference';
        ALTER TABLE scenes
          ADD COLUMN IF NOT EXISTS end_frame_url TEXT,
          ADD COLUMN IF NOT EXISTS end_frame_prompt TEXT,
          ADD COLUMN IF NOT EXISTS seed_skipped BOOLEAN DEFAULT FALSE;
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          messages JSONB NOT NULL DEFAULT '[]',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS static_ad_jobs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          status TEXT NOT NULL DEFAULT 'uploading',
          product_id UUID REFERENCES product_profiles(id) ON DELETE SET NULL,
          input_image_url TEXT,
          psych_analysis JSONB,
          extracted_copy JSONB,
          final_copy JSONB,
          output_image_url TEXT,
          output_file_size_bytes INTEGER,
          generation_prompt TEXT,
          last_error TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        ALTER TABLE static_ad_jobs ADD COLUMN IF NOT EXISTS composition_spec JSONB;
        ALTER TABLE static_ad_jobs ADD COLUMN IF NOT EXISTS quality_score JSONB;
        ALTER TABLE static_ad_generations ADD COLUMN IF NOT EXISTS quality_check JSONB;
        ALTER TABLE static_ad_generations ADD COLUMN IF NOT EXISTS is_rejected BOOLEAN DEFAULT FALSE;
        ALTER TABLE static_ad_generations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
        ALTER TABLE static_ad_generations ADD COLUMN IF NOT EXISTS quality_score JSONB;
        CREATE TABLE IF NOT EXISTS product_learnings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          product_id UUID NOT NULL REFERENCES product_profiles(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          source TEXT NOT NULL,
          source_id TEXT,
          learning TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
    } catch {}

    // Clean up knowledge docs stuck in "processing" from a previous crash
    try {
      const { db } = await import("@/db");
      const { knowledgeDocuments } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(knowledgeDocuments)
        .set({ status: "error" })
        .where(eq(knowledgeDocuments.status, "processing"));
    } catch {}
  }
}
