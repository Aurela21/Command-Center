/**
 * Anthropic Claude API client
 *
 * Models per spec:
 * - claude-sonnet-4-20250514  → speed tasks (frame analysis, quality scoring)
 * - claude-opus-4-0-20250115  → deep analysis (video context, script generation)
 */

import Anthropic from "@anthropic-ai/sdk";

// Singleton
declare global {
  var _anthropic: Anthropic | undefined;
}

function getClient(): Anthropic {
  if (globalThis._anthropic) return globalThis._anthropic;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (process.env.NODE_ENV !== "production") globalThis._anthropic = client;
  return client;
}

const FAST = "claude-sonnet-4-6";
const DEEP = "claude-opus-4-6";

// ─── Step 2: Video context analysis ─────────────────────────────────────────

export type VideoAnalysis = {
  transcript: string;
  framework: string;
  visual_style: string;
  tone: string;
  target_audience: string;
};

export async function analyzeVideoContext(
  scenes: Array<{
    order: number;
    description: string;
    startTimeMs: number;
    endTimeMs: number;
  }>,
  metadata: { durationMs: number; fps: number },
  visionSummary?: string
): Promise<VideoAnalysis> {
  const msg = await getClient().messages.create({
    model: DEEP,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze this video ad structure and extract key insights.

Video: ${(metadata.durationMs / 1000).toFixed(1)}s at ${metadata.fps}fps
${visionSummary ? `\nVisual analysis:\n${visionSummary}` : ""}

Scene breakdown:
${scenes.map((s) => `${s.order}. [${(s.startTimeMs / 1000).toFixed(1)}s–${(s.endTimeMs / 1000).toFixed(1)}s] ${s.description}`).join("\n")}

Return a JSON object with these exact keys:
{
  "transcript": "narrative summary of the video",
  "framework": "marketing framework (e.g. PAS, AIDA, Before/After/Bridge)",
  "visual_style": "visual aesthetic description",
  "tone": "emotional tone of the ad",
  "target_audience": "inferred target demographic/psychographic"
}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as VideoAnalysis)
    : {
        transcript: "",
        framework: "",
        visual_style: "",
        tone: "",
        target_audience: "",
      };
}

// ─── Step 3A: Frame compositional analysis ───────────────────────────────────

export type FrameAnalysis = {
  composition: string;
  lighting: string;
  subject: string;
  mood: string;
  suggestedPrompt: string; // Nano Banana change prompt
};

export async function analyzeFrame(
  imageUrl: string,
  visionData?: unknown
): Promise<FrameAnalysis> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `Analyze this video frame for seed image generation.${visionData ? `\n\nVision API data: ${JSON.stringify(visionData)}` : ""}

Return JSON:
{
  "composition": "describe framing, depth, shot type",
  "lighting": "describe lighting quality and direction",
  "subject": "describe the main subject",
  "mood": "describe the emotional mood",
  "suggestedPrompt": "a Nano Banana change prompt — keep the composition but change [X] to look like [Y]. Be specific and concise."
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as FrameAnalysis)
    : {
        composition: "",
        lighting: "",
        subject: "",
        mood: "",
        suggestedPrompt: "",
      };
}

// ─── Step 3A/3C: Quality scoring ─────────────────────────────────────────────

export type QualityScore = {
  overall: number; // 0–100
  breakdown: {
    prompt_adherence: number;
    visual_fidelity: number;
    reference_match?: number;
    motion_quality?: number;
  };
  notes: string;
  lipSyncRisk?: boolean; // flagged if dialogue + duration > 5s
};

export async function scoreGeneration(params: {
  prompt: string;
  outputUrl: string;
  referenceUrl?: string;
  durationS?: number;
  hasDialogue?: boolean;
}): Promise<QualityScore> {
  const content: Anthropic.MessageParam["content"] = [
    { type: "image", source: { type: "url", url: params.outputUrl } },
  ];

  if (params.referenceUrl) {
    content.push({
      type: "image",
      source: { type: "url", url: params.referenceUrl },
    });
  }

  content.push({
    type: "text",
    text: `Score this generated ${params.referenceUrl ? "image against the reference frame" : "video frame"}.

Prompt used: "${params.prompt}"
${params.durationS != null ? `Target duration: ${params.durationS}s` : ""}

Return JSON:
{
  "overall": 0-100,
  "breakdown": {
    "prompt_adherence": 0-100,
    "visual_fidelity": 0-100${params.referenceUrl ? ',\n    "reference_match": 0-100' : ""}${params.durationS != null ? ',\n    "motion_quality": 0-100' : ""}
  },
  "notes": "one sentence explanation"
}`,
  });

  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  const score: QualityScore = json
    ? (JSON.parse(json) as QualityScore)
    : {
        overall: 0,
        breakdown: { prompt_adherence: 0, visual_fidelity: 0 },
        notes: "Scoring unavailable",
      };

  // Lip-sync risk flag: dialogue present + duration > 5s
  if (params.hasDialogue && (params.durationS ?? 0) > 5) {
    score.lipSyncRisk = true;
  }

  return score;
}

// ─── Step 3B: Script generation ──────────────────────────────────────────────

export type ScriptResult = {
  fullScript: string;
  sceneSegments: string[]; // one Kling-optimized prompt per scene
};

export async function generateScript(params: {
  projectName: string;
  scenes: Array<{
    order: number;
    description: string;
    durationMs: number;
    referenceFrameUrl?: string;
    originalKlingPrompt?: string;
  }>;
  analysis: VideoAnalysis | null;
  angle: string;
  tonality: string;
  format: string;
  klingElementTags: string[];
  knowledgeChunks: Array<{ content: string; sectionTitle?: string | null; source?: "script" | "kling" }>;
}): Promise<ScriptResult> {
  const scriptChunks = params.knowledgeChunks.filter((c) => c.source !== "kling");
  const klingChunks = params.knowledgeChunks.filter((c) => c.source === "kling");

  let knowledgeSection = "";
  if (scriptChunks.length > 0) {
    knowledgeSection += `\n\n## Brand & Copy Reference (use for voiceover script)\n${scriptChunks
      .map((c, i) => `[${i + 1}]${c.sectionTitle ? ` **${c.sectionTitle}**` : ""}\n${c.content}`)
      .join("\n\n")}`;
  }
  if (klingChunks.length > 0) {
    knowledgeSection += `\n\n## Kling Prompting Reference (use for visual prompts)\n${klingChunks
      .map((c, i) => `[${i + 1}]${c.sectionTitle ? ` **${c.sectionTitle}**` : ""}\n${c.content}`)
      .join("\n\n")}`;
  }

  const msg = await getClient().messages.create({
    model: DEEP,
    max_tokens: 4096,
    system: `You are an expert DTC video ad copywriter. You produce two things simultaneously:\n\n(1) **fullScript** — a punchy voiceover/talking-head script with the actual words spoken aloud or shown as on-screen text, scene by scene. This is the DIALOGUE — write compelling, natural-sounding lines that a real person would say to camera.\n\n(2) **sceneSegments** — one UNIFIED Kling video prompt per scene that combines visual direction AND the dialogue line. Format: Subject action + camera movement + delivery style + Dialogue: "the line". The dialogue MUST be included in each Kling prompt so the video motion matches the words being spoken.\n\nWhen "Brand & Copy Reference" material is provided, match the brand voice, tone, and copywriting style closely. When "Kling Prompting Reference" material is provided, follow those prompting patterns and best practices for the visual prompts.${knowledgeSection}`,
    messages: [
      {
        role: "user",
        content: [
          // Send reference frame images so Claude sees the actual video content
          ...params.scenes.flatMap((s): Anthropic.ContentBlockParam[] =>
            s.referenceFrameUrl
              ? [
                  { type: "image", source: { type: "url", url: s.referenceFrameUrl } },
                  { type: "text", text: `↑ Scene ${s.order} reference frame` },
                ]
              : []
          ),
          {
            type: "text",
            text: `Write a complete video ad for "${params.projectName}".

IMPORTANT: Study the reference frame images above carefully. Your prompts MUST match what is ACTUALLY happening in the reference video — the subject, wardrobe, setting, actions, and camera angles you see in those frames. This is an iteration tool — the goal is to recreate and refine what's in the reference video, NOT invent entirely new scenes.

**Script Variables:**
- Angle: ${params.angle}
- Tonality: ${params.tonality}
- Format: ${params.format}
- Kling element tags (auto-inject into visual prompts): ${params.klingElementTags.join(", ") || "none"}

**Scene Structure (${params.scenes.length} scenes) with original visual analysis:**
${params.scenes.map((s) => `Scene ${s.order} (${(s.durationMs / 1000).toFixed(1)}s):
  Description: ${s.description}${s.originalKlingPrompt ? `\n  Original motion analysis (from frame-by-frame review): ${s.originalKlingPrompt}` : ""}`).join("\n\n")}

${params.analysis ? `**Video Analysis:**\n${JSON.stringify(params.analysis, null, 2)}` : ""}

**Requirements:**
- fullScript = the voiceover/talking script only — the actual words spoken or shown as on-screen text, scene by scene. No visual directions here.
- sceneSegments = one UNIFIED Kling prompt per scene that combines visuals AND dialogue. Follow this structure: Subject + motion + camera feel + delivery + Dialogue: "line".
- CRITICAL: Do NOT describe backgrounds, environments, or settings in the Kling prompts. The background comes from the seed image / reference frame automatically. Kling generates video from a seed image — whatever is in the seed IS the background. Writing "white studio" or "minimal backdrop" or any setting description wastes prompt tokens and can conflict with the seed image.
- CRITICAL: Base each scene's visual prompt on the ACTIONS and MOTION you see in the reference frames. Focus on: what the subject's body does, hand movements, gestures, camera movement, pacing.
- The dialogue line MUST be included so motion matches the words.
- Always refer to the subject as "model in reference" or "subject" — never describe demographics.

Return JSON:
{
  "fullScript": "Scene 1:\\n[voiceover line]\\n\\nScene 2:\\n[voiceover line]\\n\\n...",
  "sceneSegments": ["subject + setting + motion + camera + delivery + Dialogue: \\"line\\"", ...]
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as ScriptResult)
    : {
        fullScript: "",
        sceneSegments: params.scenes.map(() => ""),
      };
}

// ─── Static Ad Analysis ─────────────────────────────────────────────────────

export type StaticAdAnalysis = {
  visualHierarchy: string;
  colorPsychology: string;
  copyFraming: string;
  emotionalTriggers: string[];
  ctaAnalysis: string;
  attentionMechanics: string;
  overallStrategy: string;
  extractedCopy: { headline: string; body: string; cta: string };
};

export async function analyzeStaticAd(
  imageUrl: string
): Promise<StaticAdAnalysis> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 2048,
    system:
      "You are an expert direct-response advertising analyst specializing in visual persuasion, copy psychology, and conversion optimization. You analyze static ad creatives with surgical precision — identifying every psychological lever, visual hierarchy choice, and copywriting technique used.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `Analyze this static ad image. Provide a comprehensive psychological and strategic breakdown.

Extract ALL visible text from the ad — headlines, body copy, and CTA button text — as separate fields.

Return JSON:
{
  "visualHierarchy": "what the eye hits first, second, third — describe the visual flow and focal points",
  "colorPsychology": "color choices and their emotional/psychological effects on the viewer",
  "copyFraming": "how the copy is framed — urgency, social proof, benefit-led, feature-led, pain/gain, etc.",
  "emotionalTriggers": ["list", "of", "triggers", "used"],
  "ctaAnalysis": "CTA placement, language, color contrast, and urgency mechanics",
  "attentionMechanics": "contrast, whitespace, visual weight distribution, reading pattern (Z/F)",
  "overallStrategy": "synthesis — why this ad works as a whole, what makes it effective or ineffective",
  "extractedCopy": {
    "headline": "exact headline text from the ad",
    "body": "exact body copy from the ad",
    "cta": "exact CTA button/link text from the ad"
  }
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as StaticAdAnalysis)
    : {
        visualHierarchy: "",
        colorPsychology: "",
        copyFraming: "",
        emotionalTriggers: [],
        ctaAnalysis: "",
        attentionMechanics: "",
        overallStrategy: "",
        extractedCopy: { headline: "", body: "", cta: "" },
      };
}

export async function generateAdCopy(params: {
  productName: string;
  psychAnalysis: StaticAdAnalysis;
  angle?: string;
}): Promise<{ headline: string; body: string; cta: string }> {
  const msg = await getClient().messages.create({
    model: DEEP,
    max_tokens: 1024,
    system:
      "You are an elite DTC copywriter who writes high-converting ad copy. You understand direct-response psychology deeply — you match tone, urgency, and persuasion frameworks to the product and audience.",
    messages: [
      {
        role: "user",
        content: `Write new ad copy for "${params.productName}" based on this psychological analysis of a reference ad:

${JSON.stringify(params.psychAnalysis, null, 2)}

${params.angle ? `Creative angle: ${params.angle}` : ""}

Generate new copy that:
- Preserves the effective psychological structure identified in the analysis
- Adapts the messaging for the product "${params.productName}"
- Maintains the same emotional triggers and persuasion framework
- Creates a compelling, conversion-optimized version

Return JSON:
{
  "headline": "new headline text",
  "body": "new body copy text",
  "cta": "new CTA button text"
}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as { headline: string; body: string; cta: string })
    : { headline: "", body: "", cta: "" };
}

// ─── Pose Composition Spec (Video Pipeline) ─────────────────────────────────

export type PoseCompositionSpec = {
  subject: {
    type: string;
    bodyOrientation: string;
    headPosition: string;
    eyeline: string;
    pose: string;
    framing: string;
  };
  camera: {
    angle: string;
    shotType: string;
    focalLength: string;
  };
  subjectPlacement: {
    horizontal: string;
    vertical: string;
    scale: string;
  };
  lighting: {
    keyDirection: string;
    quality: string;
    contrast: string;
  };
};

export async function analyzePoseComposition(
  imageUrl: string
): Promise<PoseCompositionSpec> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 1024,
    system:
      "You are a cinematography and composition analyst. You extract precise spatial and positional data from images — body positioning, camera angles, lighting direction, and subject placement. Be specific and measurable, not vague.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `Analyze the pose and composition of this frame. Be precise about left vs right, exact angles, specific body part positions. Say 'left arm bent 90 degrees at elbow, hand resting on left hip' not 'hand on hip'. Say 'subject centered horizontally, head at upper 30% of frame' not 'centered'.

Return JSON:
{
  "subject": {
    "type": "person | product | object",
    "bodyOrientation": "e.g. facing camera, square shoulders / turned 30 degrees left",
    "headPosition": "e.g. centered, slight left tilt / turned right 15 degrees",
    "eyeline": "e.g. direct to camera / looking left and down 20 degrees",
    "pose": "e.g. standing, left hand on hip bent at 90 degrees, right arm relaxed at side",
    "framing": "e.g. waist-up / full body / close-up head and shoulders"
  },
  "camera": {
    "angle": "e.g. eye level / low angle 15 degrees up / high angle 30 degrees down",
    "shotType": "e.g. medium close-up / wide shot / extreme close-up",
    "focalLength": "e.g. 50mm shallow DOF / 35mm wide / 85mm compressed"
  },
  "subjectPlacement": {
    "horizontal": "e.g. center-right, rule of thirds right line / dead center",
    "vertical": "e.g. head at upper third / centered vertically / feet at bottom edge",
    "scale": "e.g. subject fills 60% of frame height / subject fills 40% of frame width"
  },
  "lighting": {
    "keyDirection": "e.g. front-left 45 degrees / direct overhead / backlit from right",
    "quality": "e.g. soft diffused / hard directional with sharp shadows",
    "contrast": "e.g. low contrast, fill light present / high contrast, deep shadows"
  }
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as PoseCompositionSpec)
    : {
        subject: { type: "person", bodyOrientation: "", headPosition: "", eyeline: "", pose: "", framing: "" },
        camera: { angle: "", shotType: "", focalLength: "" },
        subjectPlacement: { horizontal: "", vertical: "", scale: "" },
        lighting: { keyDirection: "", quality: "", contrast: "" },
      };
}

export async function comparePoseToSpec(params: {
  generatedImageUrl: string;
  poseSpec: PoseCompositionSpec;
}): Promise<{ match: boolean; mismatches: string[]; score: number }> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: params.generatedImageUrl } },
          {
            type: "text",
            text: `Compare this generated image against the following pose/composition specification. For each field, check if the image matches.

SPECIFICATION:
${JSON.stringify(params.poseSpec, null, 2)}

Return JSON:
{
  "match": true/false (true if 80%+ of fields match),
  "mismatches": ["Subject is facing left but spec says facing camera", ...],
  "score": 0-100 overall match percentage
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as { match: boolean; mismatches: string[]; score: number })
    : { match: false, mismatches: ["Unable to analyze"], score: 0 };
}

// ─── Ad Composition Spec (Static Ad Pipeline) ──────────────────────────────

export type AdCompositionSpec = {
  layout: {
    type: string;
    readingPattern: string;
    gridStructure: string;
  };
  productPlacement: {
    position: string;
    scale: string;
    angle: string;
    cropStyle: string;
  };
  textZones: {
    headlinePosition: string;
    bodyPosition: string;
    ctaPosition: string;
  };
  visualWeight: {
    primaryFocalPoint: string;
    secondaryFocalPoint: string;
    negativeSpace: string;
  };
  colorLayout: {
    backgroundTreatment: string;
    dominantColorZones: string;
    contrastStrategy: string;
  };
};

export async function analyzeAdComposition(
  imageUrl: string
): Promise<AdCompositionSpec> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 1024,
    system:
      "You are a graphic design and advertising layout analyst. You extract precise spatial composition data from ad images — product placement, text positioning, visual weight distribution, and color zoning. Be specific and measurable.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `Analyze the layout composition of this ad image. Be precise: say 'product occupies left 35% of frame, vertically centered' not 'product on the left'. Say 'headline top-right, right-aligned, starting at 15% from top edge' not 'headline at top'.

Return JSON:
{
  "layout": {
    "type": "e.g. single product centered / split layout / full bleed",
    "readingPattern": "e.g. Z-pattern / F-pattern / center-radial",
    "gridStructure": "e.g. product left 40%, copy right 60% / product center, text overlay"
  },
  "productPlacement": {
    "position": "e.g. center-left, occupying 35% of frame width",
    "scale": "e.g. product fills 40% of frame height",
    "angle": "e.g. 45-degree hero angle from front-left / straight-on front view",
    "cropStyle": "e.g. full product visible / cropped at base / floating with shadow"
  },
  "textZones": {
    "headlinePosition": "e.g. top-right quadrant, right-aligned, 20% from top",
    "bodyPosition": "e.g. below headline, right-aligned, 30% frame width",
    "ctaPosition": "e.g. bottom-right, pill button shape, 10% from bottom"
  },
  "visualWeight": {
    "primaryFocalPoint": "e.g. product at center-left",
    "secondaryFocalPoint": "e.g. headline at top-right",
    "negativeSpace": "e.g. generous whitespace left margin, tight right"
  },
  "colorLayout": {
    "backgroundTreatment": "e.g. solid dark gradient / lifestyle scene / flat color",
    "dominantColorZones": "e.g. warm tones left (product), cool tones right (copy area)",
    "contrastStrategy": "e.g. light text on dark background, CTA inverts to bright on dark"
  }
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as AdCompositionSpec)
    : {
        layout: { type: "", readingPattern: "", gridStructure: "" },
        productPlacement: { position: "", scale: "", angle: "", cropStyle: "" },
        textZones: { headlinePosition: "", bodyPosition: "", ctaPosition: "" },
        visualWeight: { primaryFocalPoint: "", secondaryFocalPoint: "", negativeSpace: "" },
        colorLayout: { backgroundTreatment: "", dominantColorZones: "", contrastStrategy: "" },
      };
}

export async function compareAdToSpec(params: {
  generatedImageUrl: string;
  compositionSpec: AdCompositionSpec;
}): Promise<{ match: boolean; mismatches: string[]; score: number }> {
  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: params.generatedImageUrl } },
          {
            type: "text",
            text: `Compare this generated ad image against the following layout/composition specification. Check product placement, text zone positions, layout structure, and visual weight distribution.

SPECIFICATION:
${JSON.stringify(params.compositionSpec, null, 2)}

Return JSON:
{
  "match": true/false (true if 80%+ of layout fields match),
  "mismatches": ["Product is on the right but spec says center-left", ...],
  "score": 0-100 overall layout match percentage
}`,
          },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  return json
    ? (JSON.parse(json) as { match: boolean; mismatches: string[]; score: number })
    : { match: false, mismatches: ["Unable to analyze"], score: 0 };
}

// ─── Prompt refinement layer ────────────────────────────────────────────────

export type RefineTarget = "seed_image" | "kling_video";

export async function refinePrompt(params: {
  userPrompt: string;
  target: RefineTarget;
  sceneDescription: string;
  durationS?: number;
  productContext?: string;       // product name + description + image labels
  styleKnowledge?: string;       // from Style knowledge category
  klingKnowledge?: string;       // from Kling Prompts knowledge category
  referenceFrameUrl?: string;    // can be sent to Claude for visual context
  rejectionHistory?: string;     // past rejection reasons to avoid repeating mistakes
  productLearnings?: string;    // learned from past generations of this product
}): Promise<string> {
  const content: Anthropic.MessageParam["content"] = [];

  // Optionally include reference frame for visual context
  if (params.referenceFrameUrl && params.target === "seed_image") {
    content.push({
      type: "image",
      source: { type: "url", url: params.referenceFrameUrl },
    });
  }

  const targetInstructions =
    params.target === "seed_image"
      ? `You are refining a prompt for seed frame image generation (first frame of a video ad clip).
Focus on: composition, camera angle, lighting, subject positioning, color palette, depth of field, and art direction.
Output a single detailed paragraph — no line breaks, no bullet points. Max 120 words.
The output image will be 9:16 vertical format.

CRITICAL: Subject reference rules:
- NEVER describe the subject as "a young girl", "a woman", "a man", or any specific demographic. ALWAYS refer to them as "model in reference", "subject in reference frame", or "subject". The image generator will match the person from the reference frame.
- Match wardrobe, setting, and lighting from the reference frame unless the user explicitly asks to change them.

CRITICAL: Product fidelity rules:
- NEVER invent or assume how product features work. Describe features EXACTLY as stated in the product description.
- If the product description says a feature is "built into" or "integrated with" another part, they are ONE piece — do NOT describe them as separate items.
- If you are unsure how a feature physically works, omit the detail rather than guessing wrong.
- Use the product image labels to understand what each feature actually looks like — these are real photos of the real product.`
      : `You are refining a prompt for Kling AI video generation (image-to-video).
Focus on: motion description, camera movement (pan/tilt/zoom/dolly/static), subject action, atmosphere, pacing.
Do NOT describe static composition — the seed image already handles that. Describe what MOVES and HOW.
Keep it under 40 words — Kling quality degrades above 50 words.
Output a single concise paragraph.

CRITICAL: Do NOT invent product feature descriptions. If referencing a product, describe only actions/movements — not how the product is constructed.`;

  let context = `Scene context: ${params.sceneDescription}`;
  if (params.durationS) context += `\nTarget duration: ${params.durationS}s`;
  if (params.productContext) context += `\n\nProduct details:\n${params.productContext}`;
  if (params.styleKnowledge) context += `\n\nStyle reference:\n${params.styleKnowledge}`;
  if (params.klingKnowledge) context += `\n\nKling prompting best practices:\n${params.klingKnowledge}`;
  if (params.productLearnings) context += `\n\nLEARNED FROM PAST GENERATIONS OF THIS PRODUCT:\n${params.productLearnings}`;
  if (params.rejectionHistory) context += `\n\nPREVIOUS REJECTED GENERATIONS (avoid these issues):\n${params.rejectionHistory}`;

  content.push({
    type: "text",
    text: `${targetInstructions}

${context}

User's brief prompt: "${params.userPrompt}"

Expand this into an optimized generation prompt. Keep the user's creative intent — add technical detail, not different ideas.

IMPORTANT: Any @tags in the user's prompt (e.g. @airplane-hoodie) MUST be preserved exactly as-is in the refined output. These are system references to product image profiles — do NOT rewrite them as plain text, do NOT remove the @ prefix, do NOT change the tag name. Place the @tag naturally within the sentence.

Return ONLY the refined prompt text, nothing else.`,
  });

  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 300,
    messages: [{ role: "user", content }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return text.trim().replace(/^["']|["']$/g, "");
}

// ─── Approval analysis ──────────────────────────────────────────────────────

export async function analyzeApproval(
  imageUrl: string,
  generationPrompt: string | null,
  productName?: string
): Promise<string> {
  try {
    const msg = await getClient().messages.create({
      model: FAST,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text: `This AI-generated image was APPROVED by the user — they liked this output.${generationPrompt ? `\n\nGeneration prompt: "${generationPrompt}"` : ""}${productName ? `\n\nProduct: ${productName}` : ""}

Analyze what this generation got RIGHT in 2-4 bullet points. Focus on:
- What product details were accurately reproduced
- What composition choices worked well
- What the prompt got right that should be repeated
Be specific and actionable — these insights will guide future generations. Return ONLY the bullet points.`,
            },
          ],
        },
      ],
    });

    return msg.content[0].type === "text" ? msg.content[0].text.trim() : "Analysis unavailable";
  } catch (err) {
    console.warn("[analyzeApproval] Failed:", err);
    return "Analysis unavailable";
  }
}

// ─── Product learning distillation ──────────────────────────────────────────

export async function distillLearning(
  rawAnalysis: string,
  type: "positive" | "negative"
): Promise<string> {
  try {
    const msg = await getClient().messages.create({
      model: FAST,
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `Distill these observations into ONE concise, actionable prompt engineering insight (max 30 words). Start with "${type === "positive" ? "DO:" : "AVOID:"}".

Example: "DO: specify charcoal as dark gray, not blue-black — model defaults to cool tones"
Example: "AVOID: placing product at extreme left — CTA gets cropped on mobile"

Observations:
${rawAnalysis}

Return ONLY the single insight line.`,
        },
      ],
    });

    return msg.content[0].type === "text" ? msg.content[0].text.trim() : rawAnalysis.slice(0, 100);
  } catch {
    return rawAnalysis.slice(0, 100);
  }
}
