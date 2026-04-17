import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { assetVersions, scenes, projects } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import archiver from "archiver";
import { PassThrough } from "stream";

export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const { versionIds } = (await req.json()) as { versionIds: string[] };

  if (!versionIds?.length) {
    return NextResponse.json(
      { error: "versionIds required" },
      { status: 400 }
    );
  }

  // Fetch requested asset versions
  const versions = await db
    .select({
      id: assetVersions.id,
      fileUrl: assetVersions.fileUrl,
      versionNumber: assetVersions.versionNumber,
      sceneId: assetVersions.sceneId,
    })
    .from(assetVersions)
    .where(inArray(assetVersions.id, versionIds));

  if (versions.length === 0) {
    return NextResponse.json(
      { error: "No versions found" },
      { status: 404 }
    );
  }

  // Get scene orders for filenames
  const sceneIds = [...new Set(versions.map((v) => v.sceneId))];
  const sceneRows = await db
    .select({ id: scenes.id, sceneOrder: scenes.sceneOrder })
    .from(scenes)
    .where(inArray(scenes.id, sceneIds));
  const sceneOrderMap = new Map(sceneRows.map((s) => [s.id, s.sceneOrder]));

  // Get project name for zip filename
  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId));
  const slug = (project?.name ?? "videos")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Build zip — level 1 since MP4 is already compressed
  const archive = archiver("zip", { zlib: { level: 1 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  // Set up the readable stream BEFORE adding files to avoid missing data events
  const readable = new ReadableStream({
    start(controller) {
      passthrough.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      passthrough.on("end", () => {
        controller.close();
      });
      passthrough.on("error", (err) => {
        controller.error(err);
      });
    },
  });

  // Add files and finalize in the background — the stream pipes as data arrives
  (async () => {
    for (const v of versions) {
      try {
        const res = await fetch(v.fileUrl);
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        const order = String(sceneOrderMap.get(v.sceneId) ?? 0).padStart(2, "0");
        const ext = v.fileUrl.includes(".webm") ? "webm" : "mp4";
        archive.append(buffer, {
          name: `scene-${order}-v${v.versionNumber}.${ext}`,
        });
      } catch {
        // Skip failed downloads
      }
    }
    await archive.finalize();
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-videos.zip"`,
    },
  });
}
