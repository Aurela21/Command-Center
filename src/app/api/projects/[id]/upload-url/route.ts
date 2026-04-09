import { NextRequest, NextResponse } from "next/server";
import { presignedPut, extFromMime } from "@/lib/r2";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;

  // Verify project exists
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, id));
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const contentType =
    req.nextUrl.searchParams.get("contentType") ?? "video/mp4";
  const ext = extFromMime(contentType);
  const key = `${id}/reference_video.${ext}`;

  const uploadUrl = await presignedPut(key, contentType);

  return NextResponse.json({ uploadUrl, key });
}
