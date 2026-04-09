"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2, Sparkles, Zap } from "lucide-react";
import type { SceneProductionState } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Flag lip sync risk: dialogue-style content AND duration > 5s */
function hasLipSyncRisk(description: string, durationS: number): boolean {
  if (durationS <= 5) return false;
  return /\b(vo|voice.?over|direct.to.camera|testimonial|says|speaks|interview|monologue)\b/i.test(
    description
  );
}

// ─── Mock script generator ───────────────────────────────────────────────────
// Produces a formatted script + per-scene Kling prompts.
// In production this calls /api/projects/:id/generate-script → Claude.

function generateMockScript(
  angle: string,
  tonality: string,
  format: string
): string {
  return `[${format.toUpperCase()} · ${angle} · ${tonality}]

SCENE 01 — KINETIC OPEN (0:00–0:04)
VO (off-screen): "Every step. Every rep. Every limit—"

SCENE 02 — THE PROBLEM (0:04–0:08)
VO: "—is just a suit you haven't taken off yet."

SCENE 03 — PROBLEM MONTAGE (0:08–0:12)
[No dialogue — action-driven cut]

SCENE 04 — BRAND REVEAL (0:12–0:15)
SUPER: "Move Without Limits"

SCENE 05 — PRODUCT SHOWCASE (0:15–0:20)
VO: "Engineered for athletes who refuse to be held back."

SCENE 06 — TECH DEMO (0:20–0:24)
VO: "Four-way stretch. Ventilation mesh. Zero restrictions."

SCENE 07 — PROOF OF PERFORMANCE (0:24–0:28)
[No dialogue — rapid cut montage]

SCENE 08 — SOCIAL PROOF (0:28–0:32)
SUPER: "50,000+ athletes trust AirFlex"

SCENE 09 — TESTIMONIAL (0:32–0:36)
SARAH: "I've tried everything. Nothing moves like this. It's the last pair I'll ever need."

SCENE 10 — COMPARISON (0:36–0:39)
VO: "The difference is clear."

SCENE 11 — CTA (0:39–0:42)
SUPER: "FLEX30 · Shop Now · Limited Time"

SCENE 12 — LOGO LOCK (0:42–0:45)
SUPER: "AirFlex Pro · airflexpro.com"`;
}

const MOCK_KLING_PROMPTS: Record<number, string> = {
  1: "Slow motion tracking shot at foot level following an athlete's stride, golden hour dust particles suspended in warm morning light, cinematic 4K",
  2: "Close-up of person in stiff athletic clothing mid-squat, frustrated expression, crisp studio lighting, sharp texture detail on fabric stress points",
  3: "Rapid intercutting: seam stress on lateral lunge, sweat-soaked fabric bunching, restricted overhead press, three athletes three identical pain points, kinetic editing rhythm",
  4: "Brand logo dissolving in from clean white background, elegant sans-serif tagline fading beneath, minimal negative space, confident and still",
  5: "360-degree product rotation of athletic leggings on floating studio pedestal, macro closeup of four-way stretch fabric and ventilation mesh weave, premium lifestyle lighting",
  6: "Split screen thermal imaging comparison: left side competitor activewear with heat-trapped red zones, right side AirFlex staying cool blue throughout HIIT sprint sequence under dramatic studio lighting",
  7: "Rapid cut montage: gymnast full split, CrossFit overhead press, yoga pigeon pose, all three athletes fluid and unrestricted in matching leggings, annotation overlay text, upbeat rhythm",
  8: "Counter animation rolling to 50000 plus, five-star review cards scrolling in clean motion, three customer photo and quote pairings appearing sequentially, credibility-forward graphic design",
  9: "Marathon runner woman speaking directly to camera in warmly lit minimalist home gym, natural handheld cinematography, genuine emotion and conviction, shallow depth of field with soft bokeh, warm practical lighting",
  10: "Mirror-matched split screen with movements synchronized frame for frame: left athlete straining in old gear, right same athlete moving powerfully in AirFlex, seamless parallel editing",
  11: "Full product lineup on clean white sweep, bold promo code typography animating in with kinetic energy, pulsing call to action button, urgency text rising from bottom",
  12: "Brand logo lockup centered on white, website URL fading in beneath, bold tagline, clean breathing space, confident final hold before cut to black",
};

// ─── Scene prompt card ────────────────────────────────────────────────────────

function ScenePromptCard({
  scene,
  updateScene,
}: {
  scene: SceneProductionState;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
}) {
  const wc = wordCount(scene.klingPrompt);
  const lipSync = hasLipSyncRisk(scene.description, scene.targetClipDurationS);

  const wcColor =
    wc === 0
      ? "text-neutral-400"
      : wc > 50
      ? "text-red-600 font-semibold"
      : wc > 40
      ? "text-amber-600 font-semibold"
      : "text-emerald-600";

  const cardBorder =
    wc > 50
      ? "border-red-200"
      : wc > 40
      ? "border-amber-200"
      : "border-neutral-100";

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-5 space-y-4 transition-colors",
        cardBorder
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: scene.color }}
          />
          <span className="text-xs font-medium text-neutral-500 tabular-nums">
            Scene {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span className="text-xs text-neutral-400">
            &middot; {scene.targetClipDurationS.toFixed(1)}s
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Word count badge */}
          <span
            className={cn(
              "text-xs tabular-nums px-2 py-0.5 rounded-full",
              wc > 50
                ? "bg-red-50 text-red-600"
                : wc > 40
                ? "bg-amber-50 text-amber-600"
                : wc > 0
                ? "bg-emerald-50 text-emerald-600"
                : "bg-neutral-100 text-neutral-400"
            )}
          >
            {wc}w
          </span>
          {/* Approval state */}
          {scene.klingPromptApproved ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" />
              Approved
            </span>
          ) : null}
        </div>
      </div>

      {/* Description snippet */}
      <p className="text-xs text-neutral-400 leading-relaxed line-clamp-1">
        {scene.description}
      </p>

      {/* Kling prompt textarea */}
      <textarea
        value={scene.klingPrompt}
        onChange={(e) => {
          updateScene(scene.sceneId, {
            klingPrompt: e.target.value,
            klingPromptApproved: false,
          });
        }}
        rows={3}
        placeholder="Kling generation prompt for this scene…"
        className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 focus:bg-white transition-all placeholder:text-neutral-400"
      />

      {/* Warnings */}
      <div className="space-y-1.5">
        {wc > 50 && (
          <div className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Prompt exceeds 50 words — Kling quality degrades above this limit
          </div>
        )}
        {wc > 40 && wc <= 50 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Approaching 50-word limit — consider trimming for best results
          </div>
        )}
        {lipSync && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            Lip sync risk — dialogue content with clip &gt;5s may have sync
            issues
          </div>
        )}
      </div>

      {/* Approve button */}
      <div className="flex justify-end pt-1">
        {scene.klingPromptApproved ? (
          <button
            onClick={() =>
              updateScene(scene.sceneId, { klingPromptApproved: false })
            }
            className="text-xs font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Unapprove
          </button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={!scene.klingPrompt.trim()}
            onClick={() =>
              updateScene(scene.sceneId, { klingPromptApproved: true })
            }
            className="h-8 text-xs gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Approve Prompt
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Script generator panel ───────────────────────────────────────────────────

const ANGLES = [
  "Dynamic",
  "Wide Shot",
  "Medium Shot",
  "Close-Up",
  "Low Angle",
  "Overhead",
];
const TONALITIES = [
  "Energetic",
  "Professional",
  "Emotional",
  "Playful",
  "Aspirational",
  "Urgent",
];
const FORMATS = [
  "DTC Product",
  "Brand Awareness",
  "Testimonial",
  "Tutorial",
  "Comparison",
];

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  script: string;
  onScriptChange: (script: string) => void;
};

export function Tab3B({ scenes, updateScene, script, onScriptChange }: Props) {
  const [angle, setAngle] = useState("Dynamic");
  const [tonality, setTonality] = useState("Energetic");
  const [format, setFormat] = useState("DTC Product");
  const [generating, setGenerating] = useState(false);

  const approvedCount = scenes.filter((s) => s.klingPromptApproved).length;

  function handleGenerateScript() {
    setGenerating(true);
    // Mock: generate after short delay. Production: POST to API → Claude.
    setTimeout(() => {
      const generatedScript = generateMockScript(angle, tonality, format);
      onScriptChange(generatedScript);

      // Populate per-scene Kling prompts from mock map
      scenes.forEach((scene) => {
        const prompt = MOCK_KLING_PROMPTS[scene.sceneOrder] ?? "";
        updateScene(scene.sceneId, {
          klingPrompt: prompt,
          klingPromptApproved: false,
        });
      });

      setGenerating(false);
    }, 2000);
  }

  const selectClass =
    "text-sm border border-neutral-200 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all text-neutral-700";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Script generator (top, fixed) */}
      <div className="shrink-0 px-8 py-5 border-b border-neutral-200 bg-neutral-50/50">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-500">Camera Angle</p>
            <select
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className={selectClass}
            >
              {ANGLES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-500">Tonality</p>
            <select
              value={tonality}
              onChange={(e) => setTonality(e.target.value)}
              className={selectClass}
            >
              {TONALITIES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-neutral-500">Format</p>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className={selectClass}
            >
              {FORMATS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleGenerateScript}
            disabled={generating}
            className="gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm disabled:opacity-40"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Generate Script
              </>
            )}
          </Button>
        </div>

        {/* Script output */}
        {script && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-2">
              Generated Script
            </p>
            <textarea
              value={script}
              onChange={(e) => onScriptChange(e.target.value)}
              rows={8}
              className="w-full text-xs font-mono rounded-md border border-neutral-200 px-3 py-2.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all text-neutral-600 leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Scene prompts (scrollable) */}
      <div className="flex-1 overflow-y-auto px-8 py-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
            Scene Prompts
          </p>
          <p className="text-xs text-neutral-400">
            {approvedCount}/{scenes.length} approved
          </p>
        </div>
        <div className="space-y-3">
          {scenes.map((scene) => (
            <ScenePromptCard
              key={scene.sceneId}
              scene={scene}
              updateScene={updateScene}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
