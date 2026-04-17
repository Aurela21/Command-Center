/**
 * NB2 Prompt Construction Module
 *
 * Single chokepoint for every Nano Banana 2 (Gemini 3.1 Flash Image) prompt
 * in the Command Center. Builds the text payload and reference-image array
 * that get sent to the Gemini API. Does NOT make API calls — that belongs
 * in the thin API wrapper (nano-banana.ts) which imports from this module.
 *
 * Behavioral source of truth: docs/nano-banana-2-knowledge.md
 * This module and that document must be updated together when either changes.
 * Every convention, failure-mode mitigation, vocabulary list, and anti-pattern
 * in the knowledge doc is reflected here.
 */

import type { PoseCompositionSpec } from "./claude";
import type { StaticAdAnalysis, AdCompositionSpec } from "./claude";

// ─── Model & Limits ────────────────────────────────────────────────────────

/** Gemini 3.1 Flash Image API model identifier. */
export const NB2_MODEL_ID = "gemini-3.1-flash-image-preview" as const;

/** Hard API limit: max reference images per call (§9 of knowledge doc). */
export const MAX_REFERENCE_IMAGES = 14;

/** Max words for direct NB2 text rendering before Pillow is preferred (§6). */
export const TEXT_OVERLAY_WORD_LIMIT = 8;

/** All aspect ratios supported by NB2 (§1). */
export const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4",
  "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1",
] as const;

export type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

/** Supported output resolutions in pixels (§1). */
export const SUPPORTED_RESOLUTIONS = [512, 1024, 2048, 4096] as const;

// ─── Vocabulary Maps (§7) ──────────────────────────────────────────────────

/** Lighting presets mapped to prose fragments for prompt injection. */
export const LIGHTING_PRESETS = {
  "golden-hour": "warm golden-hour sunlight raking at 15 degrees above horizon",
  "overcast-soft": "soft overcast daylight, even diffusion, no hard shadows",
  "studio-beauty": "frontal beauty dish with subtle fill, catchlight in eyes",
  "studio-dramatic": "single hard key light from camera-left 45 degrees, deep shadows opposite",
  "backlit-rim": "strong backlight creating rim highlights, face in gentle shadow",
  "neon-mixed": "mixed neon color cast, cyan and magenta spill on skin",
  "window-natural": "soft window light from camera-right, natural falloff",
  "overhead-flat": "overhead flat panel, minimal shadows, even commercial look",
  "low-key": "low-key lighting, single spot, majority of frame in shadow",
  "high-key": "high-key lighting, bright and airy, minimal shadows",
} as const satisfies Record<string, string>;

export type LightingPreset = keyof typeof LIGHTING_PRESETS;

/** Camera/lens presets mapped to prose fragments (§7). */
export const CAMERA_LENS_PRESETS = {
  "wide-24mm": "24mm wide-angle lens, slight barrel distortion, deep depth of field",
  "standard-35mm": "35mm standard lens, natural perspective, moderate depth of field",
  "portrait-50mm": "50mm lens, shallow depth of field, subject isolation",
  "portrait-85mm": "85mm portrait lens, compressed background, creamy bokeh",
  "telephoto-135mm": "135mm telephoto, strong background compression, tight framing",
  "macro-detail": "macro lens, extreme close-up, paper-thin depth of field",
  "cinematic-anamorphic": "anamorphic lens, horizontal flare, cinematic feel",
} as const satisfies Record<string, string>;

export type CameraLensPreset = keyof typeof CAMERA_LENS_PRESETS;

/** Color grading / film stock presets mapped to prose fragments (§7). */
export const COLOR_GRADE_PRESETS = {
  "neutral": "neutral color grading, true-to-life tones",
  "warm-analog": "warm analog film tones, lifted shadows, orange-teal split",
  "cool-desaturated": "cool desaturated palette, blue-grey shadows, muted highlights",
  "high-saturation": "punchy high-saturation grading, vivid colors, deep blacks",
  "pastel-soft": "soft pastel palette, low contrast, dreamy and airy",
  "moody-dark": "moody dark grade, crushed blacks, selective color pop",
  "vintage-film": "vintage film stock look, grain, faded blacks, warm midtones",
} as const satisfies Record<string, string>;

export type ColorGradePreset = keyof typeof COLOR_GRADE_PRESETS;

// ─── Failure Mitigation Constants (§5) ─────────────────────────────────────

/**
 * §5.1 — Plain-fabric language to suppress brand hallucination on apparel.
 * Callers opt in via `mitigateBrandHallucination: true` on SceneSpec.
 */
export const NEGATIVE_BRAND_HALLUCINATION =
  "with no logos, no brand marks, no text, and no graphics on the fabric";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Roles a reference image can play in the prompt (§4). */
export type ReferenceImageRole =
  | "front"
  | "back"
  | "left-side"
  | "right-side"
  | "graphic-detail"
  | "construction-detail"
  | "worn-shot"
  | "colorway"
  | "talent"
  | "mood"
  | "location"
  | "pose"
  | "style"
  | "custom";

/**
 * A single reference image with its documented role.
 * Every reference passed to NB2 must have a role so the relationship
 * instruction can explain it (§4, §9: "don't skip the relationship instruction").
 */
export type NB2RefImage = {
  url: string;
  role: ReferenceImageRole;
  /** Human-readable label override. Falls back to role name. */
  label?: string;
};

/**
 * Standard product reference bundle (§4).
 * Typically 6–8 images: front, back, sides, graphic detail, construction
 * detail, worn shot, optional colorway. Leaves headroom within the 14-cap.
 */
export type ProductBundle = {
  productName: string;
  /** Anchored color name for color-shift mitigation (§5.4). */
  color?: string;
  /** Material description for materiality language (§7). */
  material?: string;
  /** Distinctive graphic description for graphic-distortion mitigation (§5.2). */
  distinctiveGraphic?: string;
  /** Exact garment text for text-drift mitigation (§5.3). */
  garmentText?: string;
  /** Ordered reference images for this product. */
  references: NB2RefImage[];
};

/** Re-export for convenience — the structured pose JSON from Claude Vision. */
export type PoseSpec = PoseCompositionSpec;

/**
 * Text overlay directive for direct NB2 text rendering (§6).
 * Use only when headline ≤ 8 words and no pixel-locked alignment needed.
 */
export type TextOverlay = {
  /** Exact words to render (will be double-quoted in prompt). */
  text: string;
  /** Typography style description (e.g. "heavy blocky Impact-style sans-serif, all caps"). */
  typographyStyle: string;
  /** Placement in frame (e.g. "center-aligned, in the lower third"). */
  placement?: string;
  /** Color hint (e.g. "white on dark background"). */
  color?: string;
};

/** Ad copy for static-ad prompts. */
export type AdCopy = {
  headline: string;
  body: string;
  cta: string;
};

/** Vocabulary selections — keys into the preset maps (§7). */
export type VocabularySelections = {
  lighting?: LightingPreset;
  camera?: CameraLensPreset;
  colorGrade?: ColorGradePreset;
};

// ─── Scene Specs (discriminated union) ─────────────────────────────────────

type BaseSceneSpec = {
  /** The creative brief / subject description. */
  subject: string;
  /** Product bundles to reference. */
  products?: ProductBundle[];
  /** Vocabulary selections for lighting, camera, color. */
  vocabulary?: VocabularySelections;
  /** Text overlays for direct NB2 rendering. */
  textOverlays?: TextOverlay[];
  /** §5.1 — inject plain-fabric language to suppress brand hallucination. */
  mitigateBrandHallucination?: boolean;
  /** Product learnings from past generations. */
  learnings?: string;
  /** Previous rejection history to avoid repeating. */
  rejectionHistory?: string;
  /** User's freeform edit directive. */
  editInstructions?: string;
  /** Output aspect ratio (defaults per kind if omitted). */
  aspectRatio?: AspectRatio;
};

/**
 * Video seed image spec — one hero frame per scene, later animated by Kling.
 * Maps to the [Reference images] + [Relationship instruction] + [New scenario]
 * formula when references exist, or [Subject]+[Action]+[Location]+[Composition]+[Style]
 * for text-to-image (§3).
 */
export type VideoSeedSpec = BaseSceneSpec & {
  kind: "video-seed";
  /** Base image URL (hero or reference frame). Null = text-to-image. */
  baseImageUrl: string | null;
  /** Scene frame URL for pose reference in hero mode. */
  poseReferenceUrl?: string;
  /** Structured pose data from Claude Vision (§8). */
  poseSpec?: PoseSpec;
};

/**
 * Static ad spec — product scene generation for Pillow compositing or
 * direct NB2 text rendering (§6, §10).
 */
export type StaticAdSpec = BaseSceneSpec & {
  kind: "static-ad";
  /** Ad copy: headline, body, CTA. */
  copy: AdCopy;
  /** Psychological analysis from Claude for structure preservation. */
  psychAnalysis?: StaticAdAnalysis | null;
  /** Composition spec from Claude for layout reproduction. */
  compositionSpec?: AdCompositionSpec | null;
};

/** All scene types the module handles. */
export type SceneSpec = VideoSeedSpec | StaticAdSpec;

// ─── Output Types ──────────────────────────────────────────────────────────

/**
 * A single part in the prompt payload.
 * Text parts become `{ text }` in the Gemini API.
 * Image parts become `{ inlineData }` after the API layer downloads them.
 */
export type NB2Part =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; role: ReferenceImageRole };

/**
 * The fully constructed prompt payload ready for the API layer.
 * The API wrapper (nano-banana.ts) converts this to Gemini format
 * by downloading image URLs to base64.
 */
export type NB2PromptPayload = {
  parts: NB2Part[];
  systemInstruction?: string;
  aspectRatio: AspectRatio;
};

// ─── Validation ────────────────────────────────────────────────────────────

function assertAspectRatio(ar: string): asserts ar is AspectRatio {
  if (!(SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(ar)) {
    throw new Error(
      `Unsupported aspect ratio "${ar}". Supported: ${SUPPORTED_ASPECT_RATIOS.join(", ")}`
    );
  }
}

function countAllRefs(spec: SceneSpec): number {
  let count = 0;
  if (spec.kind === "video-seed") {
    if (spec.baseImageUrl) count++;
    if (spec.poseReferenceUrl) count++;
  }
  for (const bundle of spec.products ?? []) {
    count += bundle.references.length;
  }
  return count;
}

// ─── Renderer Helpers (exported for testability) ───────────────────────────

/**
 * §8 — Convert structured pose JSON to flowing prose.
 * Never paste raw JSON into the prompt (§9 anti-pattern).
 */
export function renderPoseClause(pose: PoseSpec): string {
  const parts: string[] = [];

  // Subject description
  const s = pose.subject;
  parts.push(
    `The subject ${s.bodyOrientation}, ${s.headPosition}, ${s.eyeline}.` +
    ` ${s.framing}, ${s.pose}.`
  );

  // Camera
  const c = pose.camera;
  parts.push(`Camera at ${c.angle}, ${c.shotType}, shot through a ${c.focalLength}.`);

  // Placement
  const p = pose.subjectPlacement;
  parts.push(
    `Position the subject at ${p.horizontal}, ${p.vertical}, ${p.scale}.`
  );

  // Lighting
  const l = pose.lighting;
  parts.push(`Light with ${l.keyDirection}, ${l.quality}, ${l.contrast}.`);

  return parts.join(" ");
}

/**
 * §5.2 — Graphic distortion mitigation. References the detail close-up slot.
 * Only called when `distinctiveGraphic` is set on the ProductBundle.
 */
export function preserveGraphicClause(
  description: string,
  detailRefSlot: number
): string {
  return (
    `The ${description} must remain centered, at the same scale and orientation ` +
    `as in reference image ${detailRefSlot}, adjusting only for natural garment draping.`
  );
}

/**
 * §5.3 — Text drift mitigation. Quotes garment text exactly.
 * Only called when `garmentText` is set on the ProductBundle.
 */
export function preserveTextClause(text: string): string {
  return `The text on the garment reads "${text}" — preserve this text exactly.`;
}

/**
 * §7 — Map vocabulary selections to prose fragments and join them into
 * a style sentence for the [Style] slot of the prompt formula.
 */
export function vocabularyToProse(
  selections: VocabularySelections | undefined
): string {
  if (!selections) return "";
  const fragments: string[] = [];
  if (selections.lighting) {
    fragments.push(LIGHTING_PRESETS[selections.lighting]);
  }
  if (selections.camera) {
    fragments.push(CAMERA_LENS_PRESETS[selections.camera]);
  }
  if (selections.colorGrade) {
    fragments.push(COLOR_GRADE_PRESETS[selections.colorGrade]);
  }
  return fragments.length > 0 ? fragments.join(", ") + "." : "";
}

/**
 * §6 — Render text overlays with proper quoting and typography description.
 * Each overlay's exact words are double-quoted. Typography described by
 * style and structure, not font name.
 */
export function renderTextOverlays(overlays: TextOverlay[]): string {
  if (overlays.length === 0) return "";

  if (overlays.length === 1) {
    const o = overlays[0];
    let clause = `Render the text "${o.text}" in ${o.typographyStyle}`;
    if (o.placement) clause += `, ${o.placement}`;
    if (o.color) clause += `, ${o.color}`;
    return clause + ".";
  }

  // Multi-line: describe each line's role explicitly (§6 rule 3)
  const lines = overlays.map((o, i) => {
    let line = `line ${i + 1} "${o.text}" in ${o.typographyStyle}`;
    if (o.placement) line += `, ${o.placement}`;
    if (o.color) line += `, ${o.color}`;
    return line;
  });

  return `Render ${overlays.length} lines of text: ${lines.join("; ")}.`;
}

/**
 * §4 — Build the reference block for a product bundle.
 * Groups images by role, produces one prose sentence per group describing
 * what the model should take from each image. Returns the relationship
 * instruction prose and the ordered image list.
 *
 * This is where the "relationship instruction" from §4 of the knowledge
 * doc gets built. Every reference image passed in must be explicitly
 * described (§9: "don't skip the relationship instruction on multi-ref calls").
 */
export function buildReferenceBlock(
  bundle: ProductBundle,
  extraRefs?: NB2RefImage[]
): { prose: string; images: NB2RefImage[] } {
  const allImages = [...bundle.references, ...(extraRefs ?? [])];
  if (allImages.length === 0) {
    return { prose: "", images: [] };
  }

  // Group by role
  const groups = new Map<ReferenceImageRole, NB2RefImage[]>();
  for (const img of allImages) {
    const existing = groups.get(img.role) ?? [];
    existing.push(img);
    groups.set(img.role, existing);
  }

  // Build prose: one sentence per group
  const sentences: string[] = [];
  let imageCounter = 0;

  // Product views first
  const productRoles: ReferenceImageRole[] = [
    "front", "back", "left-side", "right-side",
    "graphic-detail", "construction-detail", "worn-shot", "colorway",
  ];
  const productImages: NB2RefImage[] = [];
  const productDescriptions: string[] = [];

  for (const role of productRoles) {
    const imgs = groups.get(role);
    if (!imgs) continue;
    for (const img of imgs) {
      imageCounter++;
      const label = img.label ?? ROLE_LABELS[role];
      productDescriptions.push(`Image ${imageCounter} is the ${label}`);
      productImages.push(img);
    }
    groups.delete(role);
  }

  if (productDescriptions.length > 0) {
    sentences.push(
      `The following ${productDescriptions.length} images show the ${bundle.productName} from multiple angles. ` +
      productDescriptions.join(". ") + ". " +
      "Preserve the exact graphic placement, scale, color, and proportions across all generated views."
    );
  }

  // Scene-level refs (talent, mood, location, pose, style, custom)
  const sceneImages: NB2RefImage[] = [];
  for (const [role, imgs] of groups) {
    for (const img of imgs) {
      imageCounter++;
      const label = img.label ?? ROLE_LABELS[role];
      sentences.push(
        `Image ${imageCounter} is the ${label}; ${ROLE_INSTRUCTIONS[role]}`
      );
      sceneImages.push(img);
    }
  }

  return {
    prose: sentences.join(" "),
    images: [...productImages, ...sceneImages],
  };
}

/**
 * Convert DB rows (product profile + images) to a ProductBundle.
 * Maps image labels to reference image roles using best-effort matching.
 */
export function toProductBundle(
  profile: { name: string; description: string | null },
  images: Array<{ fileUrl: string; label: string | null; sortOrder: number | null }>
): ProductBundle {
  const references: NB2RefImage[] = images.map((img) => ({
    url: img.fileUrl,
    role: labelToRole(img.label),
    label: img.label ?? undefined,
  }));

  return {
    productName: profile.name,
    references,
  };
}

// ─── Internal Constants ────────────────────────────────────────────────────

/** Human-readable labels for each reference image role. */
const ROLE_LABELS: Record<ReferenceImageRole, string> = {
  "front": "front view",
  "back": "back view",
  "left-side": "left side view",
  "right-side": "right side view",
  "graphic-detail": "graphic/print detail close-up",
  "construction-detail": "construction detail (hood, cuff, hem, or trim)",
  "worn-shot": "worn reference showing drape and fit",
  "colorway": "alternate colorway",
  "talent": "talent reference",
  "mood": "lighting and mood reference",
  "location": "location reference",
  "pose": "pose reference",
  "style": "style reference",
  "custom": "reference image",
};

/** Instructions for what the model should do with each non-product role. */
const ROLE_INSTRUCTIONS: Record<ReferenceImageRole, string> = {
  "front": "preserve the overall silhouette and front details.",
  "back": "preserve the rear panel construction.",
  "left-side": "preserve the side profile.",
  "right-side": "preserve the side profile.",
  "graphic-detail": "preserve this graphic exactly.",
  "construction-detail": "match this construction detail.",
  "worn-shot": "match the drape and fit shown.",
  "colorway": "note this alternate colorway.",
  "talent": "maintain facial features and body type.",
  "mood": "match its lighting quality and direction.",
  "location": "use its palette and spatial feel.",
  "pose": "match the body position, hand placement, and head angle.",
  "style": "match the visual style and treatment.",
  "custom": "use as directed in the prompt.",
};

/** Best-effort mapping from DB image labels to reference roles. */
function labelToRole(label: string | null): ReferenceImageRole {
  if (!label) return "custom";
  const l = label.toLowerCase();
  if (l.includes("front")) return "front";
  if (l.includes("back") || l.includes("rear")) return "back";
  if (l.includes("left")) return "left-side";
  if (l.includes("right")) return "right-side";
  if (l.includes("graphic") || l.includes("print") || l.includes("logo")) return "graphic-detail";
  if (l.includes("detail") || l.includes("hood") || l.includes("cuff") || l.includes("hem")) return "construction-detail";
  if (l.includes("worn") || l.includes("model") || l.includes("on body")) return "worn-shot";
  if (l.includes("color")) return "colorway";
  return "custom";
}

// ─── Internal Prompt Builders ──────────────────────────────────────────────

/** Build product fidelity clause (appended to every multi-ref prompt with products). */
function buildProductFidelityClause(bundles: ProductBundle[]): string {
  if (bundles.length === 0) return "";
  const count = bundles.reduce((n, b) => n + b.references.length, 0);
  return (
    `\n\nCRITICAL PRODUCT FIDELITY: The ${count} product reference image(s) above ` +
    "show REAL physical product(s). The generated image MUST match these product images " +
    "EXACTLY in: color and material appearance, all visible features (pockets, zippers, " +
    "logos, hoods, straps), silhouette and fit on the body, and construction details " +
    "(seams, panels, closures). Do NOT invent, omit, or modify any product feature. " +
    "If a detail is visible in the reference images, it must appear in the output."
  );
}

/** Build mitigation clauses based on product bundle fields and flags. */
function buildMitigationClauses(
  spec: SceneSpec,
  bundles: ProductBundle[]
): string {
  const clauses: string[] = [];

  // §5.1 — Brand hallucination (opt-in flag)
  if (spec.mitigateBrandHallucination) {
    for (const b of bundles) {
      const color = b.color ?? "";
      const material = b.material ?? "garment";
      clauses.push(
        `The ${color ? color + " " : ""}${material} ${NEGATIVE_BRAND_HALLUCINATION}.`
      );
    }
  }

  // §5.2 — Graphic distortion (auto when distinctiveGraphic set)
  for (const b of bundles) {
    if (!b.distinctiveGraphic) continue;
    const detailIdx = b.references.findIndex((r) => r.role === "graphic-detail");
    if (detailIdx >= 0) {
      clauses.push(preserveGraphicClause(b.distinctiveGraphic, detailIdx + 1));
    }
  }

  // §5.3 — Text drift (auto when garmentText set)
  for (const b of bundles) {
    if (b.garmentText) {
      clauses.push(preserveTextClause(b.garmentText));
    }
  }

  // §5.4 — Color shift (auto when color set + worn-shot exists)
  for (const b of bundles) {
    if (!b.color) continue;
    const wornIdx = b.references.findIndex((r) => r.role === "worn-shot");
    if (wornIdx >= 0) {
      clauses.push(
        `Color anchored to reference image ${wornIdx + 1} — the ${b.productName} is ${b.color}.`
      );
    }
  }

  return clauses.length > 0 ? "\n\n" + clauses.join(" ") : "";
}

/** Build the pose block for video-seed prompts. */
function buildPoseBlock(spec: VideoSeedSpec): string {
  if (!spec.poseSpec) return "";
  return "\n\n" + renderPoseClause(spec.poseSpec);
}

/** Build the ad copy block for static-ad prompts. */
function buildCopyBlock(copy: AdCopy): string {
  const lines: string[] = ["Text to include in the ad:"];
  if (copy.headline) lines.push(`Headline: "${copy.headline}"`);
  if (copy.body) lines.push(`Body: "${copy.body}"`);
  if (copy.cta) lines.push(`CTA: "${copy.cta}"`);
  return lines.join("\n");
}

/** Build psychological structure preservation block (static ads). */
function buildPsychBlock(analysis: StaticAdAnalysis): string {
  const sections: string[] = ["PSYCHOLOGICAL STRUCTURE TO PRESERVE:"];
  if (analysis.visualHierarchy) sections.push(`Visual hierarchy: ${analysis.visualHierarchy}`);
  if (analysis.colorPsychology) sections.push(`Color psychology: ${analysis.colorPsychology}`);
  if (analysis.attentionMechanics) sections.push(`Attention mechanics: ${analysis.attentionMechanics}`);
  return "\n\n" + sections.join("\n");
}

/** Build layout composition block (static ads). */
function buildCompositionBlock(comp: AdCompositionSpec): string {
  const sections: string[] = [
    "EXACT LAYOUT SPECIFICATION — Reproduce this composition precisely:",
  ];
  sections.push(`Layout: ${comp.layout.type}, ${comp.layout.readingPattern}, ${comp.layout.gridStructure}.`);
  sections.push(
    `Product placement: ${comp.productPlacement.position}, ` +
    `scale ${comp.productPlacement.scale}, angle ${comp.productPlacement.angle}, ` +
    `${comp.productPlacement.cropStyle}.`
  );
  sections.push(
    `Text zones: headline at ${comp.textZones.headlinePosition}, ` +
    `body at ${comp.textZones.bodyPosition}, CTA at ${comp.textZones.ctaPosition}.`
  );
  sections.push(
    `Visual weight: primary focal point ${comp.visualWeight.primaryFocalPoint}, ` +
    `secondary ${comp.visualWeight.secondaryFocalPoint}, ` +
    `negative space ${comp.visualWeight.negativeSpace}.`
  );
  sections.push(
    `Color layout: ${comp.colorLayout.backgroundTreatment}, ` +
    `dominant zones ${comp.colorLayout.dominantColorZones}, ` +
    `contrast ${comp.colorLayout.contrastStrategy}.`
  );
  return "\n\n" + sections.join("\n");
}

// ─── Primary Entry Point ───────────────────────────────────────────────────

/**
 * Build a complete NB2 prompt payload for any scene type.
 *
 * Uses the text-to-image formula ([Subject]+[Action]+[Location]+[Composition]+[Style])
 * when there are no reference images, or the multi-reference formula
 * ([Reference images]+[Relationship instruction]+[New scenario]) when there are.
 *
 * Validates inputs: raises on >14 refs, unsupported aspect ratio, or missing
 * required fields. Does NOT make API calls — returns a payload for the API layer.
 *
 * Maps to §3 of the knowledge doc (the two canonical formulas).
 */
export function renderScenePrompt(spec: SceneSpec): NB2PromptPayload {
  // Resolve aspect ratio
  const defaultAR: AspectRatio = spec.kind === "video-seed" ? "9:16" : "1:1";
  const aspectRatio = spec.aspectRatio ?? defaultAR;
  assertAspectRatio(aspectRatio);

  // Validate subject
  if (!spec.subject?.trim()) {
    throw new Error("SceneSpec.subject is required and cannot be empty.");
  }

  // Validate ref count
  const refCount = countAllRefs(spec);
  if (refCount > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `Reference image count (${refCount}) exceeds maximum of ${MAX_REFERENCE_IMAGES}.`
    );
  }

  const bundles = spec.products ?? [];
  const hasRefs =
    refCount > 0 ||
    bundles.some((b) => b.references.length > 0);

  // ── Text-to-image path (§3 formula 1) ──
  if (!hasRefs) {
    const prose = buildTextToImageProse(spec, bundles);
    return {
      parts: [{ kind: "text", text: prose }],
      aspectRatio,
    };
  }

  // ── Multi-reference path (§3 formula 2) ──
  return buildMultiRefPayload(spec, bundles, aspectRatio);
}

// ─── Internal Assembly ─────────────────────────────────────────────────────

function buildTextToImageProse(spec: SceneSpec, bundles: ProductBundle[]): string {
  const sections: string[] = [];

  // [Subject] + [Action] + [Location/context]
  sections.push(spec.subject);

  // [Composition] — pose clause if video-seed
  if (spec.kind === "video-seed" && spec.poseSpec) {
    sections.push(renderPoseClause(spec.poseSpec));
  }

  // [Style] — vocabulary
  const styleProse = vocabularyToProse(spec.vocabulary);
  if (styleProse) sections.push(styleProse);

  // Static-ad: copy block
  if (spec.kind === "static-ad") {
    sections.push(buildCopyBlock(spec.copy));
    if (spec.psychAnalysis) sections.push(buildPsychBlock(spec.psychAnalysis));
    if (spec.compositionSpec) sections.push(buildCompositionBlock(spec.compositionSpec));
  }

  // Text overlays
  if (spec.textOverlays && spec.textOverlays.length > 0) {
    sections.push(renderTextOverlays(spec.textOverlays));
  }

  // Mitigations
  const mitigations = buildMitigationClauses(spec, bundles);
  if (mitigations) sections.push(mitigations.trim());

  // Learnings, rejection history, edit instructions
  if (spec.learnings) {
    sections.push(`\nPRODUCT LEARNINGS FROM PAST GENERATIONS:\n${spec.learnings}`);
  }
  if (spec.rejectionHistory) {
    sections.push(
      `\nPREVIOUS REJECTED GENERATIONS — Do NOT repeat these mistakes:\n${spec.rejectionHistory}`
    );
  }
  if (spec.editInstructions) {
    sections.push(
      `\nUSER EDIT INSTRUCTIONS (HIGH PRIORITY — apply these changes to the output):\n${spec.editInstructions}`
    );
  }

  // Aspect ratio instruction
  sections.push(`\nOutput must be ${aspectRatioToDesc(spec.aspectRatio ?? (spec.kind === "video-seed" ? "9:16" : "1:1"))} format.`);

  return sections.join("\n\n");
}

function buildMultiRefPayload(
  spec: SceneSpec,
  bundles: ProductBundle[],
  aspectRatio: AspectRatio
): NB2PromptPayload {
  const parts: NB2Part[] = [];
  let systemInstruction: string | undefined;

  // Video-seed: base character image
  if (spec.kind === "video-seed" && spec.baseImageUrl) {
    parts.push({
      kind: "text",
      text: "IMAGE 1 — This is the BASE CHARACTER. Keep this person's face, body, clothing, and appearance EXACTLY as shown:",
    });
    parts.push({ kind: "image", url: spec.baseImageUrl, role: "custom" });
  }

  // Video-seed: pose reference
  if (spec.kind === "video-seed" && spec.poseReferenceUrl) {
    parts.push({
      kind: "text",
      text: "POSE REFERENCE — Match this person's body position, hand placement, head angle, and framing:",
    });
    parts.push({ kind: "image", url: spec.poseReferenceUrl, role: "pose" });
  }

  // Product bundles — reference images with relationship instructions
  for (const bundle of bundles) {
    const { prose, images } = buildReferenceBlock(bundle);
    if (images.length > 0) {
      parts.push({
        kind: "text",
        text: `PRODUCT REFERENCE IMAGES — ${bundle.productName}:\n${prose}`,
      });
      for (const img of images) {
        parts.push({ kind: "image", url: img.url, role: img.role });
      }
    }
  }

  // Build the instruction text
  const instruction = buildInstructionText(spec, bundles);
  parts.push({ kind: "text", text: instruction });

  // Static-ad system instruction
  if (spec.kind === "static-ad") {
    systemInstruction =
      "You are editing a product photo into an ad. The product in the reference images " +
      "is sacred — preserve it exactly. Do not redraw, reinterpret, add to, or modify " +
      "the product. Build the ad background, text, and layout around the existing product. " +
      "If a detail is not in the original photos, do not add it.";
  }

  return { parts, systemInstruction, aspectRatio };
}

function buildInstructionText(spec: SceneSpec, bundles: ProductBundle[]): string {
  const sections: string[] = [];

  // The [New scenario] — user's creative brief
  sections.push(spec.subject);

  // Pose clause (video-seed)
  if (spec.kind === "video-seed") {
    const poseBlock = buildPoseBlock(spec);
    if (poseBlock) sections.push(poseBlock.trim());
  }

  // Vocabulary → style
  const styleProse = vocabularyToProse(spec.vocabulary);
  if (styleProse) sections.push(styleProse);

  // Product fidelity clause
  const fidelity = buildProductFidelityClause(bundles);
  if (fidelity) sections.push(fidelity.trim());

  // Static-ad specific blocks
  if (spec.kind === "static-ad") {
    sections.push(buildCopyBlock(spec.copy));
    if (spec.psychAnalysis) sections.push(buildPsychBlock(spec.psychAnalysis).trim());
    if (spec.compositionSpec) sections.push(buildCompositionBlock(spec.compositionSpec).trim());
  }

  // Text overlays
  if (spec.textOverlays && spec.textOverlays.length > 0) {
    sections.push(renderTextOverlays(spec.textOverlays));
  }

  // Mitigations
  const mitigations = buildMitigationClauses(spec, bundles);
  if (mitigations) sections.push(mitigations.trim());

  // Learnings
  if (spec.learnings) {
    sections.push(`PRODUCT LEARNINGS FROM PAST GENERATIONS:\n${spec.learnings}`);
  }

  // Rejection history
  if (spec.rejectionHistory) {
    sections.push(
      `PREVIOUS REJECTED GENERATIONS — Do NOT repeat these mistakes:\n${spec.rejectionHistory}`
    );
  }

  // Edit instructions
  if (spec.editInstructions) {
    sections.push(
      `USER EDIT INSTRUCTIONS (HIGH PRIORITY — apply these changes to the output):\n${spec.editInstructions}`
    );
  }

  // Aspect ratio
  sections.push(`Output must be ${aspectRatioToDesc(spec.aspectRatio ?? (spec.kind === "video-seed" ? "9:16" : "1:1"))} format.`);

  return sections.join("\n\n");
}

function aspectRatioToDesc(ar: AspectRatio): string {
  switch (ar) {
    case "9:16": return "9:16 vertical portrait";
    case "16:9": return "16:9 horizontal landscape";
    case "1:1": return "1:1 square";
    default: return ar;
  }
}
