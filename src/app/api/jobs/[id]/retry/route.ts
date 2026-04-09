import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requeueJob } from "@/lib/job-queue";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  // Verify job exists and is in a retryable state
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (job.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot retry job with status "${job.status}"` },
      { status: 409 }
    );
  }

  const updated = await requeueJob(id);
  return NextResponse.json(updated);
}
