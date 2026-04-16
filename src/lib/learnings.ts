/**
 * Product-level learning system.
 * Records distilled insights from approvals and rejections.
 */

import { db } from "@/db";
import { productLearnings, productProfiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { distillLearning } from "./claude";

export async function recordLearning(params: {
  productId: string;
  type: "positive" | "negative";
  source: "seed_image" | "kling_video" | "static_ad";
  sourceId: string;
  rawAnalysis: string;
}): Promise<void> {
  // Distill raw analysis into a single concise learning
  const learning = await distillLearning(params.rawAnalysis, params.type);

  // Duplicate prevention: check if first 50 chars match any recent learning
  const existing = await db
    .select({ learning: productLearnings.learning })
    .from(productLearnings)
    .where(eq(productLearnings.productId, params.productId))
    .orderBy(desc(productLearnings.createdAt))
    .limit(20);

  const prefix = learning.slice(0, 50);
  const isDuplicate = existing.some(
    (e) => e.learning.slice(0, 50) === prefix
  );
  if (isDuplicate) {
    console.log(`[learnings] Skipping duplicate: "${prefix}..."`);
    return;
  }

  await db.insert(productLearnings).values({
    productId: params.productId,
    type: params.type,
    source: params.source,
    sourceId: params.sourceId,
    learning,
  });

  console.log(`[learnings] Recorded ${params.type} learning for product ${params.productId}: "${learning}"`);
}

/**
 * Resolve product ID from @tags in a generation prompt.
 * Returns the first matched product ID, or null.
 */
export async function resolveProductFromTags(
  prompt: string | null
): Promise<string | null> {
  if (!prompt) return null;
  const tags = prompt.match(/@[\w-]+/g) ?? [];
  for (const tag of tags) {
    const slug = tag.slice(1);
    const [profile] = await db
      .select({ id: productProfiles.id })
      .from(productProfiles)
      .where(eq(productProfiles.slug, slug));
    if (profile) return profile.id;
  }
  return null;
}

/**
 * Build a learning section string for injection into generation prompts.
 */
export async function buildLearningsSection(
  productId: string
): Promise<string> {
  const learnings = await db
    .select()
    .from(productLearnings)
    .where(eq(productLearnings.productId, productId))
    .orderBy(desc(productLearnings.createdAt))
    .limit(20);

  if (learnings.length === 0) return "";

  const positive = learnings
    .filter((l) => l.type === "positive")
    .map((l) => `- ${l.learning}`)
    .join("\n");
  const negative = learnings
    .filter((l) => l.type === "negative")
    .map((l) => `- ${l.learning}`)
    .join("\n");

  let section = "LEARNED FROM PAST GENERATIONS OF THIS PRODUCT:";
  if (positive) section += `\nWhat works:\n${positive}`;
  if (negative) section += `\nWhat to avoid:\n${negative}`;

  return section;
}
