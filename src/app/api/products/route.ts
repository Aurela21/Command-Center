import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { productProfiles } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select()
    .from(productProfiles)
    .orderBy(desc(productProfiles.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, description } = (await req.json()) as {
    name: string;
    description?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Generate slug from name: "Airplane Hoodie" → "airplane-hoodie"
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const [profile] = await db
    .insert(productProfiles)
    .values({ name: name.trim(), slug, description: description?.trim() ?? "" })
    .returning();

  return NextResponse.json(profile, { status: 201 });
}
