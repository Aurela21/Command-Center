import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, klingElementTags } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [project] = await db
    .insert(projects)
    .values({
      name: name.trim(),
      klingElementTags: klingElementTags ?? [],
      status: "uploading",
    })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
