/**
 * Kling 3.0 / Higgsfield Platform Prompt Construction Module
 *
 * Single chokepoint for every Kling video generation prompt in the Command
 * Center. Builds the text prompt and the arguments payload that get passed
 * to submitKlingJob(). Does NOT make the API call itself — that belongs in
 * kling.ts which imports from this module.
 *
 * Behavioral reference: see project knowledge base — "Kling 3.0 via
 * Higgsfield Platform". This module and that document must be updated
 * together when either changes.
 */

import type { KlingSubmitRequest } from "./kling";

// ─── Constants ─────────────────────────────────────────────────────────────

/** Higgsfield application id for Kling 3.0 Pro image-to-video. */
export const KLING_APPLICATION_ID = "kling-video/v3.0/pro/image-to-video" as const;

/** Supported clip durations in seconds (§5.1: default to 5s, upgrade when needed). */
export const SUPPORTED_DURATIONS = [5, 10] as const;

/** Supported aspect ratios (§2: we almost always use 9:16 for short-form ads). */
export const SUPPORTED_ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;

/** Soft prompt length ceiling in words (§4, §11: prompts past ~60 words degrade). */
export const PROMPT_WORD_SOFT_CEILING = 60;

// ─── Vocabulary Maps (§6, §7, §8) ─────────────────────────────────────────

/**
 * Motion vocabulary organized by artifact risk tier (§6).
 * Keys are preset identifiers; values are the prose fragments sent to Kling.
 */
export const MOTION_SLOW = {
  "head-turn": "slowly turns head toward camera",
  "lift-object": "gently lifts object toward face",
  "breathe": "takes a slow breath",
  "weight-shift": "shifts weight from one foot to the other",
  "subtle-smile": "subtly smiles",
  "eye-drift": "eyes slowly drift toward camera",
  "fabric-breeze": "fabric gently catches the breeze",
} as const satisfies Record<string, string>;

export const MOTION_MEDIUM = {
  "walk-toward": "walks slowly toward camera",
  "small-wave": "raises hand in a small wave",
  "head-tilt": "tilts head thoughtfully",
  "reach-object": "reaches out to object",
  "begin-laugh": "begins to laugh",
} as const satisfies Record<string, string>;

export const MOTION_HIGH_RISK = {
  "sprint": "sprints forward",
  "dance": "dances energetically",
  "spin": "spins around",
  "throw": "throws object",
  "jump": "jumps up",
  "fast-head-turn": "whips head around",
} as const satisfies Record<string, string>;

/** Combined motion vocabulary for type inference. */
export const MOTION_VOCABULARY = {
  ...MOTION_SLOW,
  ...MOTION_MEDIUM,
  ...MOTION_HIGH_RISK,
} as const;

export type MotionPreset = keyof typeof MOTION_VOCABULARY;

/**
 * Camera direction vocabulary organized by reliability tier (§7).
 * Keys are preset identifiers; values are prose fragments.
 */
export const CAMERA_CLEAN = {
  "static": "static locked-off shot",
  "slow-push-in": "slow push in",
  "slow-dolly-in": "slow dolly in",
  "slow-pull-out": "slow pull out",
  "slow-dolly-out": "slow dolly out",
  "slow-pan-left": "slow pan left",
  "slow-pan-right": "slow pan right",
  "slight-handheld": "slight handheld sway",
} as const satisfies Record<string, string>;

export const CAMERA_MODERATE = {
  "medium-push-in": "medium-speed push in",
  "slow-orbit": "slow orbit around subject",
  "gentle-tilt-up": "gentle tilt up",
  "gentle-tilt-down": "gentle tilt down",
  "slow-rack-focus": "slow rack focus from background to subject",
} as const satisfies Record<string, string>;

export const CAMERA_RISKY = {
  "fast-whip-pan": "fast whip pan",
  "aggressive-handheld": "aggressive handheld movement",
  "360-orbit": "360 orbit around subject",
  "crane-up-with-motion": "crane up combined with subject motion",
} as const satisfies Record<string, string>;

/** Combined camera vocabulary for type inference. */
export const CAMERA_VOCABULARY = {
  ...CAMERA_CLEAN,
  ...CAMERA_MODERATE,
  ...CAMERA_RISKY,
} as const;

export type CameraPreset = keyof typeof CAMERA_VOCABULARY;

/**
 * Pacing/mood vocabulary (§8). Short, vibe-based phrases.
 * One or two words is enough — long mood descriptions get re-interpreted as motion.
 */
export const PACING_VOCABULARY = {
  "unhurried-confident": "unhurried, confident",
  "energetic-controlled": "energetic but controlled",
  "calm-contemplative": "calm and contemplative",
  "punchy-direct": "punchy, direct",
  "soft-dreamy": "soft, dreamy",
} as const satisfies Record<string, string>;

export type PacingPreset = keyof typeof PACING_VOCABULARY;

// ─── Types ─────────────────────────────────────────────────────────────────

/** Motion risk tier for advisory purposes (§6). */
export type MotionTier = "slow" | "medium" | "high-risk";

/**
 * Motion description for a Kling clip.
 * Use `preset` for vocabulary-controlled motion, or `custom` for freeform.
 * When using `custom`, set `tier` to flag the risk level for logging.
 */
export type KlingMotion = {
  preset?: MotionPreset;
  custom?: string;
  tier?: MotionTier;
};

/**
 * Camera direction for a Kling clip (§7).
 * Use `preset` for vocabulary-controlled moves, or `custom` for freeform.
 */
export type KlingCamera = {
  preset?: CameraPreset;
  custom?: string;
};

/**
 * Pacing/mood for a Kling clip (§8).
 * Use `preset` for vocabulary-controlled moods, or `custom` for freeform.
 */
export type KlingPacing = {
  preset?: PacingPreset;
  custom?: string;
};

export type KlingDuration = (typeof SUPPORTED_DURATIONS)[number];
export type KlingAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

/**
 * Top-level scene spec for Kling video generation.
 * Combines motion, camera, pacing, and Higgsfield submission parameters.
 * The prompt-builder renders this to prose; buildKlingArguments packages
 * it for submitKlingJob.
 */
export type KlingSceneSpec = {
  /** Primary motion description (§6). Required. */
  motion: KlingMotion;
  /** Camera direction (§7). Optional — omit for static shot. */
  camera?: KlingCamera;
  /** Pacing/mood (§8). Optional. */
  pacing?: KlingPacing;
  /** Seed image URL (R2 public URL). Required for image-to-video. */
  imageUrl: string;
  /** Clip duration in seconds (§5.1: default 5s). */
  duration: KlingDuration;
  /** Aspect ratio (§2: defaults to "9:16"). */
  aspectRatio?: KlingAspectRatio;
  /** Optional seed number for reproducibility. */
  seed?: number;
  /** Optional end frame URL for start/end frame mode (§9). */
  tailImageUrl?: string;
  /** Optional Kling element reference tags. Only injected if present. */
  elementTags?: string[];
  /** Text on garment/sign to preserve (§5.8). Quoted in prompt. */
  garmentText?: string;
  /** Scene continuity cue (e.g. "maintains eye contact throughout"). */
  continuity?: string;
};

// ─── Advisory Helpers ──────────────────────────────────────────────────────

/** High-risk action verbs that indicate compound or fast motion (§5.2, §5.3). */
const COMPOUND_MOTION_VERBS = [
  "walks", "turns", "raises", "lifts", "reaches", "waves",
  "tilts", "shifts", "moves", "steps", "leans", "bends",
  "pulls", "pushes", "grabs", "holds", "drops", "picks",
  "spins", "twists", "swings", "throws", "catches",
  "runs", "sprints", "jumps", "dances",
];

/**
 * §5.2 — Scan a motion clause for multiple primary action verbs.
 * Returns a warning string if compound motion is detected, null otherwise.
 * Advisory only — logs a warning, does not throw.
 */
export function checkCompoundMotion(motionClause: string): string | null {
  const lower = motionClause.toLowerCase();
  const found = COMPOUND_MOTION_VERBS.filter((verb) => {
    const re = new RegExp(`\\b${verb}\\b`, "i");
    return re.test(lower);
  });

  if (found.length > 1) {
    const warning =
      `[kling-prompt §5.2] Compound motion detected: ${found.length} action verbs ` +
      `(${found.join(", ")}) in "${motionClause.slice(0, 80)}…". ` +
      `One primary action per clip produces cleaner results.`;
    console.warn(warning);
    return warning;
  }
  return null;
}

/**
 * §4, §11 — Check if the rendered prompt exceeds the ~60 word soft ceiling.
 * Returns a warning string if over the ceiling, null otherwise.
 */
export function checkPromptLength(prompt: string): string | null {
  const wordCount = prompt.trim().split(/\s+/).length;
  if (wordCount > PROMPT_WORD_SOFT_CEILING) {
    const warning =
      `[kling-prompt §11] Prompt is ${wordCount} words, exceeding the ~${PROMPT_WORD_SOFT_CEILING}-word ` +
      `soft ceiling. Shorter prompts produce more coherent motion.`;
    console.warn(warning);
    return warning;
  }
  return null;
}

// ─── Validation ────────────────────────────────────────────────────────────

function assertDuration(d: number): asserts d is KlingDuration {
  if (!(SUPPORTED_DURATIONS as readonly number[]).includes(d)) {
    throw new Error(
      `Unsupported duration ${d}s. Supported: ${SUPPORTED_DURATIONS.join(", ")}s`
    );
  }
}

function assertAspectRatio(ar: string): asserts ar is KlingAspectRatio {
  if (!(SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(ar)) {
    throw new Error(
      `Unsupported aspect ratio "${ar}". Supported: ${SUPPORTED_ASPECT_RATIOS.join(", ")}`
    );
  }
}

// ─── Renderer Functions ────────────────────────────────────────────────────

/**
 * §6 — Render the motion clause from a KlingMotion spec.
 * Uses the preset prose fragment if available, falls back to custom.
 * Runs compound motion detection as an advisory check.
 */
export function renderMotionClause(motion: KlingMotion): string {
  let clause: string;
  if (motion.preset) {
    clause = MOTION_VOCABULARY[motion.preset];
  } else if (motion.custom) {
    clause = motion.custom;
  } else {
    throw new Error("KlingMotion must have either a preset or custom value.");
  }

  // Advisory: check for compound motion (§5.2)
  checkCompoundMotion(clause);

  return `Subject ${clause}.`;
}

/**
 * §7 — Render the camera direction clause from a KlingCamera spec.
 * Uses the preset prose fragment if available, falls back to custom.
 */
export function renderCameraClause(camera: KlingCamera): string {
  let clause: string;
  if (camera.preset) {
    clause = CAMERA_VOCABULARY[camera.preset];
  } else if (camera.custom) {
    clause = camera.custom;
  } else {
    throw new Error("KlingCamera must have either a preset or custom value.");
  }

  return `Camera: ${clause}.`;
}

/**
 * §8 — Render the pacing/mood clause from a KlingPacing spec.
 * Short and vibe-based — one or two words is enough.
 */
export function renderPacingClause(pacing: KlingPacing): string {
  let clause: string;
  if (pacing.preset) {
    clause = PACING_VOCABULARY[pacing.preset];
  } else if (pacing.custom) {
    clause = pacing.custom;
  } else {
    throw new Error("KlingPacing must have either a preset or custom value.");
  }

  return `${clause[0].toUpperCase()}${clause.slice(1)} pacing.`;
}

/**
 * §4 — Render the full Kling prompt from a KlingSceneSpec.
 * Assembles the canonical formula: [Motion] + [Camera direction] + [Pacing/mood]
 * plus optional garment text preservation (§5.8) and continuity cues.
 *
 * Does NOT re-describe the seed image's subject, location, or clothing (§3).
 * The prompt is a motion and direction layer on top of the seed image.
 */
export function renderKlingPrompt(spec: KlingSceneSpec): string {
  // Validate inputs
  assertDuration(spec.duration);
  if (spec.aspectRatio) assertAspectRatio(spec.aspectRatio);

  const parts: string[] = [];

  // [Motion description] — required
  parts.push(renderMotionClause(spec.motion));

  // [Camera direction] — optional, defaults to static
  if (spec.camera) {
    parts.push(renderCameraClause(spec.camera));
  }

  // [Pacing/mood] — optional
  if (spec.pacing) {
    parts.push(renderPacingClause(spec.pacing));
  }

  // Garment text preservation (§5.8)
  if (spec.garmentText) {
    parts.push(
      `The text on the garment reads "${spec.garmentText}" and must remain legible throughout.`
    );
  }

  // Scene continuity cue
  if (spec.continuity) {
    parts.push(spec.continuity.endsWith(".") ? spec.continuity : `${spec.continuity}.`);
  }

  const prompt = parts.join(" ");

  // Advisory: check prompt length (§11)
  checkPromptLength(prompt);

  return prompt;
}

/**
 * §10 — Build the full arguments object ready to pass to submitKlingJob().
 * Combines the rendered prompt with Higgsfield submission parameters.
 *
 * This is the main integration point. Call sites do:
 *   const args = buildKlingArguments(spec);
 *   const requestId = await submitKlingJob(args);
 */
export function buildKlingArguments(spec: KlingSceneSpec): KlingSubmitRequest {
  const prompt = renderKlingPrompt(spec);
  const aspectRatio = spec.aspectRatio ?? "9:16";
  assertAspectRatio(aspectRatio);

  const args: KlingSubmitRequest = {
    imageUrl: spec.imageUrl,
    prompt,
    durationSeconds: spec.duration,
  };

  // Optional: end frame for start/end frame mode (§9)
  if (spec.tailImageUrl) {
    args.tailImageUrl = spec.tailImageUrl;
  }

  // Optional: element tags — only injected if present
  if (spec.elementTags && spec.elementTags.length > 0) {
    args.elementTags = spec.elementTags;
  }

  return args;
}
