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
    system: `You are an expert DTC video ad copywriter. You produce two things simultaneously: (1) a punchy voiceover/talking script — the actual words spoken aloud or shown as text on screen during the ad, and (2) per-scene Kling visual prompts — technical motion/camera descriptions used to generate video clips, NOT dialogue.\n\nWhen "Brand & Copy Reference" material is provided, match the brand voice, tone, and copywriting style closely. When "Kling Prompting Reference" material is provided, follow those prompting patterns and best practices for the visual prompts.${knowledgeSection}`,
    messages: [
      {
        role: "user",
        content: `Write a complete video ad for "${params.projectName}".

**Script Variables:**
- Angle: ${params.angle}
- Tonality: ${params.tonality}
- Format: ${params.format}
- Kling element tags (auto-inject into visual prompts): ${params.klingElementTags.join(", ") || "none"}

**Scene Structure (${params.scenes.length} scenes):**
${params.scenes.map((s) => `Scene ${s.order} (${(s.durationMs / 1000).toFixed(1)}s): ${s.description}`).join("\n")}

${params.analysis ? `**Video Analysis:**\n${JSON.stringify(params.analysis, null, 2)}` : ""}

**Requirements:**
- fullScript = the voiceover/talking script only — the actual words spoken or shown as on-screen text, scene by scene. No visual directions here.
- sceneSegments = one Kling visual prompt per scene (max 40 words each) — describe camera movement, action, atmosphere, subject. Inject element tags naturally. No dialogue here.

Return JSON:
{
  "fullScript": "Scene 1:\\n[voiceover line]\\n\\nScene 2:\\n[voiceover line]\\n\\n...",
  "sceneSegments": ["kling visual prompt for scene 1", "kling visual prompt for scene 2", ...]
}`,
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
      ? `You are refining a prompt for Gemini image generation (seed frame for a video ad).
Focus on: composition, camera angle, lighting, subject positioning, color palette, depth of field, and art direction.
Output a single detailed paragraph — no line breaks, no bullet points. Max 120 words.
The output image will be 9:16 vertical format.`
      : `You are refining a prompt for Kling AI video generation (image-to-video).
Focus on: motion description, camera movement (pan/tilt/zoom/dolly/static), subject action, atmosphere, pacing.
Do NOT describe static composition — the seed image already handles that. Describe what MOVES and HOW.
Keep it under 40 words — Kling quality degrades above 50 words.
Output a single concise paragraph.`;

  let context = `Scene context: ${params.sceneDescription}`;
  if (params.durationS) context += `\nTarget duration: ${params.durationS}s`;
  if (params.productContext) context += `\n\nProduct details:\n${params.productContext}`;
  if (params.styleKnowledge) context += `\n\nStyle reference:\n${params.styleKnowledge}`;
  if (params.klingKnowledge) context += `\n\nKling prompting best practices:\n${params.klingKnowledge}`;
  if (params.rejectionHistory) context += `\n\nPREVIOUS REJECTED GENERATIONS (avoid these issues):\n${params.rejectionHistory}`;

  content.push({
    type: "text",
    text: `${targetInstructions}

${context}

User's brief prompt: "${params.userPrompt}"

Expand this into an optimized generation prompt. Keep the user's creative intent — add technical detail, not different ideas. Return ONLY the refined prompt text, nothing else.`,
  });

  const msg = await getClient().messages.create({
    model: FAST,
    max_tokens: 300,
    messages: [{ role: "user", content }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  return text.trim().replace(/^["']|["']$/g, "");
}
