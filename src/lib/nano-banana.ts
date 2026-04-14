/**
 * Seed image generation via Google AI Studio — Gemini 2.0 Flash image generation
 *
 * Synchronous: takes a reference frame + prompt, returns a generated image.
 * No polling required — result comes back in the same HTTP call (~10–30s).
 */

const MODEL = "gemini-3-pro-image-preview";
const BASE_URL = "https://generativelanguage.googleapis.com";

export type NanoBananaRequest = {
  imageUrl: string;              // public R2 URL for the reference frame
  prompt: string;                // change prompt describing what to generate
  referenceImageUrls?: string[]; // additional product images resolved from @tags
};

export type NanoBananaResult = {
  imageBase64: string;
  mimeType: string;
};

function apiKey() {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY must be set");
  return key;
}

/**
 * Generate a seed image by passing the reference frame + prompt to Gemini.
 * Returns base64-encoded image data.
 */
export async function generateSeedImage(
  req: NanoBananaRequest
): Promise<NanoBananaResult> {
  // 1. Fetch reference image from R2
  const imgRes = await fetch(req.imageUrl);
  if (!imgRes.ok) {
    throw new Error(
      `Failed to fetch reference image (${imgRes.status}): ${req.imageUrl}`
    );
  }
  const imgBuffer = await imgRes.arrayBuffer();
  const imgBase64 = Buffer.from(imgBuffer).toString("base64");
  const mimeType =
    imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";

  // 2. Fetch any product reference images (@tags)
  const refParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  if (req.referenceImageUrls?.length) {
    for (const refUrl of req.referenceImageUrls) {
      const refRes = await fetch(refUrl);
      if (!refRes.ok) {
        console.warn(`[nano-banana] Failed to fetch product image: ${refUrl}`);
        continue;
      }
      const refBuf = await refRes.arrayBuffer();
      const refMime = refRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      refParts.push({
        inlineData: { mimeType: refMime, data: Buffer.from(refBuf).toString("base64") },
      });
    }
  }

  // 3. Call Gemini image generation
  // Parts order: [reference frame] + [product images] + [text prompt]
  const parts: Array<Record<string, unknown>> = [
    { inlineData: { mimeType, data: imgBase64 } },
    ...refParts,
    { text: req.prompt },
  ];

  const url = `${BASE_URL}/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { data: string; mimeType: string } }>;
      };
    }>;
  };

  const imagePart = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData
  );

  if (!imagePart?.inlineData) {
    throw new Error("Gemini returned no image in response");
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

// ─── Legacy stubs — kept so cron.ts compiles without changes ─────────────────

/** @deprecated Use generateSeedImage instead */
export async function submitNanoBananaJob(
  _req: NanoBananaRequest
): Promise<string> {
  throw new Error("submitNanoBananaJob is no longer used");
}

/**
 * Called by cron for any lingering queued jobs from before the rewrite.
 * Marks them failed so they stop polluting the queue.
 */
export async function pollNanoBananaJob(
  internalJobId: string,
  _externalJobId: string
): Promise<void> {
  const { failJob } = await import("./job-queue");
  await failJob(internalJobId, "Superseded — resubmit from the UI");
}
