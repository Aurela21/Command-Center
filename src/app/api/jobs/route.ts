import { NextRequest, NextResponse } from "next/server";
import { getJobsByProject } from "@/lib/job-queue";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const rows = await getJobsByProject(projectId);
  return NextResponse.json(rows);
}
