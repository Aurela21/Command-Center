/**
 * POST /api/projects/[id]/upload-video
 *
 * Accepts the raw video file body and uploads it to R2.
 * Uses server-side upload to avoid CORS issues with direct browser → R2.
 *
 * Request: Content-Type: video/mp4 (or video/quicktime, video/webm)
 *          Body: raw file bytes
 * Response: { key: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { extFromMime } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min for large video uploads

function getClient(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });
}

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  try {
    // Verify project exists
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") ?? "video/mp4";
    const ext = extFromMime(contentType);
    const key = `${projectId}/reference_video.${ext}`;

    // Read entire body into a buffer
    const arrayBuffer = await req.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty file body" }, { status: 400 });
    }
    const buffer = Buffer.from(arrayBuffer);

    console.log(
      `[upload-video] Uploading ${(buffer.byteLength / 1e6).toFixed(1)} MB to R2 key: ${key}`
    );

    await getClient().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    console.log(`[upload-video] Upload complete: ${key}`);
    return NextResponse.json({ key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload-video] Failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
