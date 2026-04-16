/**
 * Nano Banana — image generation via Google Gemini API
 *
 * Thin API wrapper. Prompt construction lives in nb2-prompt.ts.
 * This module handles: image download, base64 conversion, API call, response parsing.
 *
 * Auth: API key via NANO_BANANA_API_KEY
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */

import { NB2_MODEL_ID, type NB2PromptPayload, type NB2Part } from "./nb2-prompt";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type RefImage = { url: string; label?: string };

import type { PoseCompositionSpec } from "./claude";

export type NanoBananaRequest = {
  imageUrl: string | null; // public R2 URL for the reference frame (null for text-to-image)
  prompt: string; // change prompt describing what to generate
  referenceImages?: RefImage[]; // product images + pose refs with optional labels
  poseSpec?: PoseCompositionSpec; // structured pose/composition data for precise spatial matching
  /** When provided, skips legacy inline prompt building and uses the NB2 payload directly. */
  nb2Payload?: NB2PromptPayload;
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

/**
 * Convert an NB2PromptPayload into the Gemini API parts array.
 * Downloads images and converts to base64 inlineData.
 */
async function payloadToGeminiParts(
  payload: NB2PromptPayload
): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const part of payload.parts) {
    if (part.kind === "text") {
      parts.push({ text: part.text });
    } else {
      try {
        const img = await downloadImageBase64(part.url);
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      } catch (err) {
        console.warn(`[nano-banana] Failed to download ref image: ${part.url}`, err);
      }
    }
  }
  return parts;
}

async function generateViaNanoBanana(
  req: NanoBananaRequest
): Promise<NanoBananaResult> {
  const key = nanoBananaKey();
  if (!key) throw new Error("NANO_BANANA_API_KEY is not set");

  // NB2 prompt module path — skip legacy inline prompt building
  if (req.nb2Payload) {
    const geminiParts = await payloadToGeminiParts(req.nb2Payload);
    const body: Record<string, unknown> = {
      contents: [{ parts: geminiParts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    };
    if (req.nb2Payload.systemInstruction) {
      body.system_instruction = {
        parts: [{ text: req.nb2Payload.systemInstruction }],
      };
    }
    console.log(`[nano-banana] NB2 path: calling ${NB2_MODEL_ID} with ${geminiParts.length} parts`);
    const url = `${GEMINI_BASE}/models/${NB2_MODEL_ID}:generateContent?key=${key}`;
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
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }>;
      error?: { message: string };
    };
    if (data.error) throw new Error(`Nano Banana error: ${data.error.message}`);
    for (const candidate of data.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { imageBase64: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
        }
      }
    }
    throw new Error("Nano Banana returned no image in response");
  }

  // ── Legacy inline prompt building (backward compatible) ──
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

  if (poseRef && req.poseSpec) {
    const ps = req.poseSpec;
    instruction += `\n\nCRITICAL POSE SPECIFICATION — Match these EXACT spatial parameters:

SUBJECT:
- Body: ${ps.subject.bodyOrientation}
- Head: ${ps.subject.headPosition}
- Eyeline: ${ps.subject.eyeline}
- Pose: ${ps.subject.pose}
- Framing: ${ps.subject.framing}

CAMERA:
- Angle: ${ps.camera.angle}
- Shot: ${ps.camera.shotType}
- Lens: ${ps.camera.focalLength}

PLACEMENT:
- Horizontal: ${ps.subjectPlacement.horizontal}
- Vertical: ${ps.subjectPlacement.vertical}
- Scale: ${ps.subjectPlacement.scale}

LIGHTING:
- Key: ${ps.lighting.keyDirection}
- Quality: ${ps.lighting.quality}
- Contrast: ${ps.lighting.contrast}

Keep the CHARACTER from IMAGE 1 (face, clothing, appearance). Apply the pose and composition above. IMAGE 2 is the visual reference for these spatial parameters.`;
  } else if (poseRef) {
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

  console.log(`[nano-banana] Calling ${NB2_MODEL_ID} with ${parts.length - 1} image(s)`);

  const url = `${GEMINI_BASE}/models/${NB2_MODEL_ID}:generateContent?key=${key}`;
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

// ─── Static Ad Generation ───────────────────────────────────────────────────

export type StaticAdRequest = {
  productImages: Array<{ url: string; label: string }>; // 1-3 hero images with labels
  prompt: string; // full generation prompt including copy + layout instructions (layout from Claude analysis, not a reference image)
  /** When provided, skips legacy inline prompt building and uses the NB2 payload directly. */
  nb2Payload?: NB2PromptPayload;
};

/**
 * Generate a static ad image using Nano Banana Pro (Gemini).
 * Takes a reference ad + product images + generation prompt, returns a new ad image.
 *
 * // TODO: Confirm Nano Banana Pro API input schema for static ad regeneration —
 * // current implementation assumes same generateContent endpoint with multiple
 * // image inputs + text prompt, identical to seed image generation.
 */
export async function generateStaticAd(
  req: StaticAdRequest
): Promise<NanoBananaResult> {
  const key = nanoBananaKey();
  if (!key) throw new Error("NANO_BANANA_API_KEY is not set");

  // NB2 prompt module path
  if (req.nb2Payload) {
    const geminiParts = await payloadToGeminiParts(req.nb2Payload);
    const body: Record<string, unknown> = {
      contents: [{ parts: geminiParts }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    };
    if (req.nb2Payload.systemInstruction) {
      body.system_instruction = {
        parts: [{ text: req.nb2Payload.systemInstruction }],
      };
    }
    console.log(`[nano-banana] NB2 static-ad path: ${geminiParts.length} parts`);
    const url = `${GEMINI_BASE}/models/${NB2_MODEL_ID}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Nano Banana static ad ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> } }>;
      error?: { message: string };
    };
    if (data.error) throw new Error(`Nano Banana error: ${data.error.message}`);
    for (const candidate of data.candidates ?? []) {
      for (const part of candidate.content?.parts ?? []) {
        if (part.inlineData?.data) {
          return { imageBase64: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
        }
      }
    }
    throw new Error("Nano Banana returned no image for static ad generation");
  }

  const parts: Array<Record<string, unknown>> = [];

  // ── PRIMARY IMAGE — the first product photo is the BASE (same pattern as generateSeedImage) ──
  // Gemini preserves the primary image much better than reference images.
  // By making the product photo the base, the model edits around it instead of redrawing it.
  const [primary, ...additional] = req.productImages;

  if (primary) {
    parts.push({
      text: "IMAGE 1 — This is the BASE PRODUCT. Keep this product's appearance EXACTLY as shown — same shape, color, material, every detail. Do NOT redraw or modify this product in any way:",
    });
    try {
      const primaryImg = await downloadImageBase64(primary.url);
      parts.push({ inlineData: { mimeType: primaryImg.mimeType, data: primaryImg.base64 } });
    } catch (err) {
      console.warn(`[nano-banana] Failed to download primary product image: ${primary.url}`, err);
    }
  }

  // Additional product angles as references
  for (const img of additional) {
    try {
      parts.push({ text: `ADDITIONAL PRODUCT ANGLE — ${img.label}:` });
      const refImg = await downloadImageBase64(img.url);
      parts.push({ inlineData: { mimeType: refImg.mimeType, data: refImg.base64 } });
    } catch (err) {
      console.warn(`[nano-banana] Failed to download product image: ${img.url}`, err);
    }
  }

  // ── PROMPT — framed as "edit this product photo into an ad" ──
  parts.push({
    text: `Edit the product photo above into a square 1:1 static ad image. Keep the product EXACTLY as it appears — do not redraw it, do not add any features, do not change any details. Build the ad layout AROUND the product.

${req.prompt}`,
  });

  const body = {
    contents: [{ parts }],
    system_instruction: {
      parts: [
        {
          text: "You are editing a product photo into an ad. The product in IMAGE 1 is sacred — preserve it exactly. Do not redraw, reinterpret, add to, or modify the product. Build the ad background, text, and layout around the existing product. If a detail is not in the original photo, do not add it. Output square 1:1.",
        },
      ],
    },
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  console.log(
    `[nano-banana] Static ad generation: ${parts.length} parts (${req.productImages.length} product images)`
  );

  const url = `${GEMINI_BASE}/models/${NB2_MODEL_ID}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nano Banana static ad ${res.status}: ${text.slice(0, 300)}`);
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

  throw new Error("Nano Banana returned no image for static ad generation");
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
