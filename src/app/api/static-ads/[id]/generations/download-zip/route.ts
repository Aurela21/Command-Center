import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  staticAdGenerations,
  staticAdJobs,
  productProfiles,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import archiver from "archiver";
import { PassThrough } from "stream";

export const runtime = "nodejs";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { generationIds } = (await req.json()) as {
    generationIds: string[];
  };

  if (!generationIds?.length) {
    return NextResponse.json(
      { error: "generationIds required" },
      { status: 400 }
    );
  }

  // Get generations
  const generations = await db
    .select()
    .from(staticAdGenerations)
    .where(inArray(staticAdGenerations.id, generationIds));

  if (generations.length === 0) {
    return NextResponse.json(
      { error: "No generations found" },
      { status: 404 }
    );
  }

  // Get product slug for filenames
  const [job] = await db
    .select({ productId: staticAdJobs.productId })
    .from(staticAdJobs)
    .where(eq(staticAdJobs.id, id));

  let productSlug = "static-ad";
  if (job?.productId) {
    const [product] = await db
      .select({ slug: productProfiles.slug })
      .from(productProfiles)
      .where(eq(productProfiles.id, job.productId));
    if (product) productSlug = product.slug;
  }

  // Build zip archive
  const archive = archiver("zip", { zlib: { level: 5 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  for (const gen of generations) {
    try {
      const res = await fetch(gen.imageUrl);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const ext = gen.imageUrl.includes(".png") ? "png" : "jpg";
      archive.append(buffer, {
        name: `${productSlug}-v${gen.versionNumber}.${ext}`,
      });
    } catch {
      // Skip failed downloads
    }
  }

  await archive.finalize();

  // Convert PassThrough stream to ReadableStream for Response
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

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="static-ads-${productSlug}.zip"`,
    },
  });
}
