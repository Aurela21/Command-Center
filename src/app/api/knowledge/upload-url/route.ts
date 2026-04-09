import { NextRequest, NextResponse } from "next/server";
import { presignedPut } from "@/lib/r2";
import { inferFileType } from "@/lib/text-extraction";

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get("filename");
  const contentType = req.nextUrl.searchParams.get("contentType") ?? "application/octet-stream";

  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  const fileType = inferFileType(filename) ?? inferFileType(contentType);
  if (!fileType) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, DOCX, or TXT." },
      { status: 400 }
    );
  }

  const key = `knowledge/${Date.now()}-${filename.replace(/[^a-z0-9._-]/gi, "_")}`;
  const uploadUrl = await presignedPut(key, contentType);

  return NextResponse.json({ uploadUrl, key, fileType });
}
