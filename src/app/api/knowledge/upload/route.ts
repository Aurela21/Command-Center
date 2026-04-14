/**
 * POST /api/knowledge/upload?filename=...&contentType=...
 * Body: raw file bytes
 *
 * Uploads a knowledge base file to R2 server-side (avoids CORS).
 * Returns { key, fileType } for the caller to create the document record.
 */

import { NextRequest, NextResponse } from "next/server";
import { uploadBuffer } from "@/lib/r2";
import { inferFileType } from "@/lib/text-extraction";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("filename");
  const contentType =
    req.nextUrl.searchParams.get("contentType") ?? "application/octet-stream";

  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const fileType = inferFileType(filename) ?? inferFileType(contentType);
  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  console.log(
    `[knowledge/upload] Receiving ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`
  );

  const key = `knowledge/${Date.now()}-${filename.replace(/[^a-z0-9._-]/gi, "_")}`;

  try {
    await uploadBuffer(key, buffer, contentType);
    console.log(`[knowledge/upload] Uploaded to R2: ${key}`);
    return NextResponse.json({ key, fileType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[knowledge/upload] Failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
