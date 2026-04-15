import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdJobs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { uploadBuffer } from "@/lib/r2";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [job] = await db
    .select({ id: staticAdJobs.id })
    .from(staticAdJobs)
    .where(eq(staticAdJobs.id, id));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine extension from content type
  const ext = file.type.includes("png")
    ? "png"
    : file.type.includes("webp")
      ? "webp"
      : "jpg";

  const contentType = file.type || "image/jpeg";
  const key = `static-ads/${id}/${Date.now()}-reference.${ext}`;
  const fileUrl = await uploadBuffer(key, buffer, contentType);

  // Update job with input image URL
  await db
    .update(staticAdJobs)
    .set({ inputImageUrl: fileUrl, updatedAt: sql`NOW()` })
    .where(eq(staticAdJobs.id, id));

  return NextResponse.json({ fileUrl });
}
