/**
 * Google Cloud Vision API client
 *
 * Used for:
 * - Step 2: Keyframe analysis to detect visual scene boundaries
 * - Step 3A: Detailed frame analysis before seed image generation
 *
 * ~100 calls per project (keyframes + per-scene reference frames)
 */

export type VisionLabel = {
  description: string;
  score: number; // 0–1
};

export type VisionObject = {
  name: string;
  score: number;
  boundingPoly?: unknown;
};

export type VisionFace = {
  detectionConfidence: number;
  joyLikelihood: string;
  sorrowLikelihood: string;
  angerLikelihood: string;
  surpriseLikelihood: string;
};

export type VisionColor = {
  color: { red: number; green: number; blue: number };
  score: number;
  pixelFraction: number;
};

export type VisionAnalysis = {
  labels: VisionLabel[];
  objects: VisionObject[];
  faces: VisionFace[];
  dominantColors: VisionColor[];
  text: string | null;
  safeSearch: {
    adult: string;
    violence: string;
  } | null;
};

const VISION_ENDPOINT =
  "https://vision.googleapis.com/v1/images:annotate";

/** Analyze a single image URL. Returns rich annotation data. */
export async function analyzeImage(imageUrl: string): Promise<VisionAnalysis> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY is not set");

  const res = await fetch(`${VISION_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri: imageUrl } },
          features: [
            { type: "LABEL_DETECTION", maxResults: 20 },
            { type: "OBJECT_LOCALIZATION", maxResults: 20 },
            { type: "FACE_DETECTION", maxResults: 10 },
            { type: "IMAGE_PROPERTIES" },
            { type: "TEXT_DETECTION" },
            { type: "SAFE_SEARCH_DETECTION" },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Vision ${res.status}: ${text}`);
  }

  const data = await res.json();
  const r = data.responses?.[0] ?? {};

  return {
    labels: r.labelAnnotations ?? [],
    objects: r.localizedObjectAnnotations ?? [],
    faces: r.faceAnnotations ?? [],
    dominantColors:
      r.imagePropertiesAnnotation?.dominantColors?.colors ?? [],
    text: r.textAnnotations?.[0]?.description ?? null,
    safeSearch: r.safeSearchAnnotation ?? null,
  };
}

/**
 * Analyze multiple images in a single batched API call (max 16 per request).
 * More efficient for keyframe strip analysis in Step 2.
 */
export async function analyzeImageBatch(
  imageUrls: string[]
): Promise<VisionAnalysis[]> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY is not set");

  // Vision API allows max 16 images per request — fire all batches in parallel
  const BATCH_SIZE = 16;
  const batches: string[][] = [];
  for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
    batches.push(imageUrls.slice(i, i + BATCH_SIZE));
  }

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const res = await fetch(`${VISION_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((url) => ({
            image: { source: { imageUri: url } },
            features: [
              { type: "LABEL_DETECTION", maxResults: 15 },
              { type: "OBJECT_LOCALIZATION", maxResults: 10 },
              { type: "IMAGE_PROPERTIES" },
            ],
          })),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google Vision batch ${res.status}: ${text}`);
      }

      const data = await res.json();
      return (data.responses ?? []).map((r: Record<string, unknown>) => ({
        labels: (r.labelAnnotations ?? []) as VisionLabel[],
        objects: (r.localizedObjectAnnotations ?? []) as VisionObject[],
        faces: [] as VisionFace[],
        dominantColors:
          ((r.imagePropertiesAnnotation as Record<string, unknown>)
            ?.dominantColors as Record<string, unknown>)?.colors as VisionColor[] ?? [],
        text: null,
        safeSearch: null,
      })) as VisionAnalysis[];
    })
  );

  return batchResults.flat();
}
