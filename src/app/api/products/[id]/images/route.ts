/**
 * POST /api/products/[id]/images?filename=...&contentType=...
 * Body: raw image bytes
 *
 * Uploads a product image to R2, auto-labels it via Claude Vision,
 * and creates a product_images record.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productProfiles, productImages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { uploadBuffer } from "@/lib/r2";
import Anthropic from "@anthropic-ai/sdk";

type Params = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

// Singleton Claude client
function getClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function autoLabel(imageBase64: string, mimeType: string): Promise<string> {
  try {
    const msg = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: imageBase64 },
            },
            {
              type: "text",
              text: 'This is a product photo for an e-commerce clothing brand. Generate a kebab-case tag (lowercase, hyphens, no spaces) that describes: the camera angle and what part of the product is shown.\n\nExamples: "front-full-body", "back-detail-hood", "left-arm-zipper-pocket-closeup", "fabric-texture-macro", "hood-interior-eye-mask", "side-profile-waist-up", "front-zipper-detail"\n\nReturn ONLY the tag, nothing else. No quotes, no explanation.',
            },
          ],
        },
      ],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    // Clean up: lowercase, trim quotes, limit length
    // Enforce kebab-case: lowercase, replace spaces/underscores with hyphens, strip non-alphanumeric
    return text.trim().replace(/^["']|["']$/g, "").toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "unlabeled";
  } catch (err) {
    console.error("[auto-label] Claude Vision failed:", err);
    return "unlabeled";
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, id));
  return NextResponse.json(images);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const filename = req.nextUrl.searchParams.get("filename") ?? "image.jpg";
  const contentType =
    req.nextUrl.searchParams.get("contentType") ?? "image/jpeg";
  const manualLabel = req.nextUrl.searchParams.get("label"); // optional manual override

  // Verify product exists
  const [product] = await db
    .select()
    .from(productProfiles)
    .where(eq(productProfiles.id, productId));
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  console.log(
    `[product-images] Uploading ${filename} for ${product.slug} (${(buffer.length / 1024).toFixed(1)} KB)`
  );

  // Upload to R2
  const key = `products/${product.slug}/${Date.now()}-${filename.replace(/[^a-z0-9._-]/gi, "_")}`;
  const fileUrl = await uploadBuffer(key, buffer, contentType);

  // Auto-label via Claude Vision (or use manual label)
  const imageBase64 = buffer.toString("base64");
  const mimeType = contentType.split(";")[0];
  let label: string;
  let autoLabelResult: string | null = null;

  if (manualLabel?.trim()) {
    label = manualLabel.trim();
  } else {
    autoLabelResult = await autoLabel(imageBase64, mimeType);
    label = autoLabelResult;
  }

  // Get current image count for sort order
  const existing = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  // Create record
  const [img] = await db
    .insert(productImages)
    .values({
      productId,
      fileUrl,
      label,
      autoLabeled: autoLabelResult,
      sortOrder: existing.length,
    })
    .returning();

  // Update image count
  await db
    .update(productProfiles)
    .set({ imageCount: existing.length + 1, updatedAt: sql`NOW()` })
    .where(eq(productProfiles.id, productId));

  console.log(`[product-images] ${product.slug}: "${label}" → ${key}`);

  return NextResponse.json(img, { status: 201 });
}

/** PATCH /api/products/[id]/images?imageId=...  — update label */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: _productId } = await params;
  const { imageId, label } = (await req.json()) as {
    imageId: string;
    label: string;
  };

  if (!imageId || !label?.trim()) {
    return NextResponse.json(
      { error: "imageId and label are required" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(productImages)
    .set({ label: label.trim() })
    .where(eq(productImages.id, imageId))
    .returning();

  return NextResponse.json(updated);
}

/** DELETE body: { imageId } */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: productId } = await params;
  const { imageId } = (await req.json()) as { imageId: string };

  await db.delete(productImages).where(eq(productImages.id, imageId));

  // Update count
  const remaining = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId));

  await db
    .update(productProfiles)
    .set({ imageCount: remaining.length, updatedAt: sql`NOW()` })
    .where(eq(productProfiles.id, productId));

  return NextResponse.json({ ok: true });
}
