import { NextRequest, NextResponse } from "next/server";
import { presignedPut, publicUrl } from "@/lib/r2";
import { db } from "@/db";
import { staticAdJobs } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;

  const [job] = await db
    .select({ id: staticAdJobs.id })
    .from(staticAdJobs)
    .where(eq(staticAdJobs.id, id));

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const filename =
    req.nextUrl.searchParams.get("filename") ?? "reference.jpg";
  const contentType =
    req.nextUrl.searchParams.get("contentType") ?? "image/jpeg";

  const key = `static-ads/${id}/${Date.now()}-${filename}`;
  const uploadUrl = await presignedPut(key, contentType);
  const fileUrl = publicUrl(key);

  return NextResponse.json({ uploadUrl, fileUrl });
}
