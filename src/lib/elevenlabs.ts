/**
 * ElevenLabs TTS client — raw fetch, matching higgsfield.ts pattern.
 *
 * Model: always eleven_v3
 * Auth: xi-api-key header
 * Endpoint: https://api.elevenlabs.io
 */

const BASE_URL = "https://api.elevenlabs.io";
const MODEL_ID = "eleven_v3";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY must be set");
  return key;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels: Record<string, string>;
  preview_url: string | null;
};

// ── List voices on account ───────────────────────────────────────────────────

let cachedVoices: { data: ElevenLabsVoice[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  if (cachedVoices && Date.now() - cachedVoices.ts < CACHE_TTL) {
    return cachedVoices.data;
  }

  const res = await fetch(`${BASE_URL}/v2/voices?page_size=100`, {
    headers: { "xi-api-key": apiKey() },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs voices ${res.status}: ${text}`);
  }

  const body = (await res.json()) as {
    voices: Array<{
      voice_id: string;
      name: string;
      labels: Record<string, string>;
      preview_url: string | null;
    }>;
  };

  const voices: ElevenLabsVoice[] = body.voices.map((v) => ({
    voice_id: v.voice_id,
    name: v.name,
    labels: v.labels ?? {},
    preview_url: v.preview_url,
  }));

  cachedVoices = { data: voices, ts: Date.now() };
  return voices;
}

// ── Generate speech ──────────────────────────────────────────────────────────

export async function generateSpeech(params: {
  voiceId: string;
  text: string;
  speed?: number;
}): Promise<Buffer> {
  const { voiceId, text, speed = 1.0 } = params;

  const res = await fetch(
    `${BASE_URL}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          speed: Math.max(0.7, Math.min(1.2, speed)),
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs TTS ${res.status}: ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
