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
  const { name, klingElementTags, type } = await req.json() as {
    name: string;
    klingElementTags?: string[];
    type?: "reference" | "concept";
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const projectType = type === "concept" ? "concept" : "reference";
  const status = projectType === "concept" ? "concept_setup" : "uploading";

  const [project] = await db
    .insert(projects)
    .values({
      name: name.trim(),
      projectType,
      klingElementTags: klingElementTags ?? [],
      status,
    })
    .returning();

  return NextResponse.json(project, { status: 201 });
}
