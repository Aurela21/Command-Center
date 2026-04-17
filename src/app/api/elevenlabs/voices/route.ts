import { NextResponse } from "next/server";
import { listVoices } from "@/lib/elevenlabs";

export async function GET() {
  try {
    const voices = await listVoices();
    return NextResponse.json(voices);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
