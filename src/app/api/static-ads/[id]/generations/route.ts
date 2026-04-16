import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staticAdGenerations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(staticAdGenerations)
    .where(eq(staticAdGenerations.jobId, id))
    .orderBy(desc(staticAdGenerations.versionNumber));

  return NextResponse.json(rows);
}
