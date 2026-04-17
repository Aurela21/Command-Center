import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { projects, scenes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { generateSpeech } from "@/lib/elevenlabs";
import { uploadBuffer } from "@/lib/r2";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

type VoiceoverGeneration = {
  id: string;
  url: string;
  voiceId: string;
  voiceName: string;
  speed: number;
  matchedPacing: boolean;
  durationMs: number;
  createdAt: string;
};

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = (await req.json()) as {
    voiceId: string;
    voiceName: string;
    text: string;
    speed: number;
    matchPacing: boolean;
  };

  if (!body.voiceId || !body.text?.trim()) {
    return NextResponse.json(
      { error: "voiceId and text are required" },
      { status: 400 }
    );
  }

  // Load project + scenes for pacing calculation
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sceneRows = await db
    .select({ targetClipDurationS: scenes.targetClipDurationS })
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .orderBy(asc(scenes.sceneOrder));

  const totalVideoDurationS = sceneRows.reduce(
    (sum, s) => sum + (s.targetClipDurationS ?? 5),
    0
  );

  // Compute speed for pacing match
  let finalSpeed = Math.max(0.7, Math.min(1.2, body.speed));
  let textToSpeak = body.text.trim();

  if (body.matchPacing && totalVideoDurationS > 0) {
    const wordCount = textToSpeak.split(/\s+/).length;
    // ~150 WPM at speed 1.0
    const estimatedDurationS = (wordCount / 150) * 60;
    const neededSpeed = estimatedDurationS / totalVideoDurationS;
    finalSpeed = Math.max(0.7, Math.min(1.2, neededSpeed));

    // If script is too short even at 0.7x, insert [pause] tags
    const durationAt07 = estimatedDurationS / 0.7;
    if (durationAt07 < totalVideoDurationS) {
      const deficit = totalVideoDurationS - durationAt07;
      const pauseCount = Math.max(1, Math.ceil(deficit / 1.5));
      const sentences = textToSpeak.split(/(?<=[.!?])\s+/);
      if (sentences.length > 1) {
        const interval = Math.max(1, Math.floor(sentences.length / pauseCount));
        const withPauses: string[] = [];
        for (let i = 0; i < sentences.length; i++) {
          withPauses.push(sentences[i]);
          if ((i + 1) % interval === 0 && i < sentences.length - 1) {
            withPauses.push("[pause]");
          }
        }
        textToSpeak = withPauses.join(" ");
      }
      finalSpeed = 0.7;
    }
  }

  // Generate speech
  const audioBuffer = await generateSpeech({
    voiceId: body.voiceId,
    text: textToSpeak,
    speed: finalSpeed,
  });

  // Estimate duration from buffer size (128kbps MP3)
  const durationMs = Math.round((audioBuffer.length * 8) / 128);

  // Upload to R2
  const key = `voiceovers/${projectId}/${Date.now()}.mp3`;
  const url = await uploadBuffer(key, audioBuffer, "audio/mpeg");

  // Build generation record
  const generation: VoiceoverGeneration = {
    id: randomUUID(),
    url,
    voiceId: body.voiceId,
    voiceName: body.voiceName,
    speed: finalSpeed,
    matchedPacing: body.matchPacing,
    durationMs,
    createdAt: new Date().toISOString(),
  };

  // Prepend to history
  const existingHistory =
    (project.voiceoverHistory as VoiceoverGeneration[] | null) ?? [];
  const history = [generation, ...existingHistory].slice(0, 20); // keep last 20

  // Update project
  await db
    .update(projects)
    .set({
      voiceoverId: body.voiceId,
      voiceoverName: body.voiceName,
      voiceoverUrl: url,
      voiceoverSpeed: finalSpeed,
      voiceoverMatchPacing: body.matchPacing,
      voiceoverHistory: history,
    })
    .where(eq(projects.id, projectId));

  return NextResponse.json({
    url,
    durationMs,
    speed: finalSpeed,
    generation,
  });
}
