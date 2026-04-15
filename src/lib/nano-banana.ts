/**
 * Nano Banana Pro — image generation via Google Gemini API
 *
 * Model: gemini-3-pro-image-preview (Nano Banana Pro)
 * Auth: API key via NANO_BANANA_API_KEY
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *
 * Synchronous — sends image + prompt, gets edited image back directly.
 * Falls back to Higgsfield Platform API if NANO_BANANA_API_KEY is not set.
 */

const NB_MODEL = "gemini-3-pro-image-preview";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type RefImage = { url: string; label?: string };

export type NanoBananaRequest = {
  imageUrl: string | null; // public R2 URL for the reference frame (null for text-to-image)
  prompt: string; // change prompt describing what to generate
  referenceImages?: RefImage[]; // product images + pose refs with optional labels
};

export type NanoBananaResult = {
  imageBase64: string;
  mimeType: string;
};

// ─── Direct Nano Banana Pro (Gemini) ─────────────────────────────────────────

function nanoBananaKey(): string | undefined {
  return process.env.NANO_BANANA_API_KEY || undefined;
}

async function downloadImageBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  return { base64: Buffer.from(buffer).toString("base64"), mimeType };
}

async function generateViaNanoBanana(
  req: NanoBananaRequest
): Promise<NanoBananaResult> {
  const key = nanoBananaKey();
  if (!key) throw new Error("NANO_BANANA_API_KEY is not set");

  // Build parts with labeled images so Gemini knows each image's role
  const parts: Array<Record<string, unknown>> = [];
  const refs = req.referenceImages ?? [];
  let failedDownloads = 0;

  // Separate pose reference (first ref in hero mode — has no label) from product refs
  // Pose ref is the scene's reference frame, injected by generate-seed in hero mode
  const hasPoseRef = req.imageUrl && refs.length > 0 && !refs[0].label;
  const poseRef = hasPoseRef ? refs[0] : null;
  const productRefs = hasPoseRef ? refs.slice(1) : refs;

  // PRIMARY IMAGE — the base character or hero model
  if (req.imageUrl) {
    parts.push({ text: "IMAGE 1 — This is the BASE CHARACTER. Keep this person's face, body, clothing, and appearance EXACTLY as shown:" });
    const primaryImg = await downloadImageBase64(req.imageUrl);
    parts.push({ inlineData: { mimeType: primaryImg.mimeType, data: primaryImg.base64 } });
  }

  // POSE REFERENCE — scene frame for pose matching (hero mode only)
  if (poseRef) {
    try {
      parts.push({ text: "IMAGE 2 — This is the POSE REFERENCE. Match this person's body position, hand placement, head angle, and framing:" });
      const poseImg = await downloadImageBase64(poseRef.url);
      parts.push({ inlineData: { mimeType: poseImg.mimeType, data: poseImg.base64 } });
    } catch (err) {
      console.warn(`[nano-banana] Failed to download pose reference: ${poseRef.url}`, err);
      failedDownloads++;
    }
  }

  // PRODUCT REFERENCE IMAGES — each labeled individually
  if (productRefs.length > 0) {
    parts.push({ text: "PRODUCT REFERENCE IMAGES — These show a REAL physical product. Study every detail:" });
    for (const ref of productRefs) {
      try {
        const label = ref.label ?? "product view";
        parts.push({ text: `PRODUCT IMAGE — ${label}:` });
        const refImg = await downloadImageBase64(ref.url);
        parts.push({ inlineData: { mimeType: refImg.mimeType, data: refImg.base64 } });
      } catch (err) {
        console.warn(`[nano-banana] Failed to download product image: ${ref.url}`, err);
        failedDownloads++;
      }
    }
  }

  // Build final instruction with product fidelity and pose matching
  let instruction = req.prompt;

  if (poseRef) {
    instruction += "\n\nCRITICAL POSE: Keep the CHARACTER from IMAGE 1 (face, clothing, appearance) but put them in the EXACT POSE from IMAGE 2 (body position, hand placement, head angle, camera framing). The output should look like IMAGE 1's person doing IMAGE 2's pose.";
  }

  if (productRefs.length > 0) {
    instruction += `\n\nCRITICAL PRODUCT FIDELITY: The ${productRefs.length} product reference image(s) above show a REAL physical product. The generated image MUST match these product images EXACTLY in:\n- Color and material appearance\n- All visible features (pockets, zippers, logos, hoods, straps)\n- Silhouette and fit on the body\n- Construction details (seams, panels, closures)\nDo NOT invent, omit, or modify any product feature. If a detail is visible in the reference images, it must appear in the output.`;
  }

  if (failedDownloads > 0) {
    instruction += `\n\nNOTE: ${failedDownloads} reference image(s) failed to load. Pay extra attention to the product description in the prompt text to compensate.`;
  }

  instruction += "\n\nIMPORTANT: Output must be 9:16 vertical portrait format.";
  parts.push({ text: instruction });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      // Not all Gemini image models support aspectRatio in config,
      // but include it in case the model does
    },
  };

  console.log(`[nano-banana] Calling ${NB_MODEL} with ${parts.length - 1} image(s)`);

  const url = `${GEMINI_BASE}/models/${NB_MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nano Banana ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType: string; data: string };
          text?: string;
        }>;
      };
    }>;
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`Nano Banana error: ${data.error.message}`);
  }

  // Find the image in the response
  for (const candidate of data.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          imageBase64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  throw new Error("Nano Banana returned no image in response");
}

// ─── Higgsfield Platform API fallback ────────────────────────────────────────

const FALLBACK_MODEL = "higgsfield-ai/soul/standard";

async function generateViaHiggsfield(
  req: NanoBananaRequest
): Promise<NanoBananaResult> {
  const { submitAndWait } = await import("./higgsfield");

  const imageUrls = [req.imageUrl, ...(req.referenceImages ?? []).map((r) => r.url)].filter(Boolean);
  const job = await submitAndWait(FALLBACK_MODEL, {
    image_urls: imageUrls,
    prompt: req.prompt,
  });

  const imageUrl = job.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error("Higgsfield completed but returned no image URL");
  }

  const img = await downloadImageBase64(imageUrl);
  return { imageBase64: img.base64, mimeType: img.mimeType };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a seed image.
 * Uses Nano Banana Pro (Gemini) if NANO_BANANA_API_KEY is set,
 * otherwise falls back to Higgsfield Platform API.
 */
export async function generateSeedImage(
  req: NanoBananaRequest
): Promise<NanoBananaResult> {
  if (nanoBananaKey()) {
    console.log("[nano-banana] Using Nano Banana Pro (Gemini)");
    return generateViaNanoBanana(req);
  }

  console.log("[nano-banana] No NANO_BANANA_API_KEY — falling back to Higgsfield");
  return generateViaHiggsfield(req);
}

// ─── Legacy stubs — kept so cron.ts compiles without changes ─────────────────

/** @deprecated Use generateSeedImage instead */
export async function submitNanoBananaJob(
  _req: NanoBananaRequest
): Promise<string> {
  throw new Error("submitNanoBananaJob is no longer used");
}

/**
 * Called by cron for any lingering queued nano_banana jobs.
 * Marks them failed so they stop polluting the queue.
 */
export async function pollNanoBananaJob(
  internalJobId: string,
  _externalJobId: string
): Promise<void> {
  const { failJob } = await import("./job-queue");
  await failJob(internalJobId, "Superseded — resubmit from the UI");
}
