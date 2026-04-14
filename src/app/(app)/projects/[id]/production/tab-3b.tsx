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
  projectId: string;
  script: string;
  onScriptChange: (script: string) => void;
};

export function Tab3B({
  scenes,
  updateScene,
  projectId,
  script,
  onScriptChange,
}: Props) {
  const [angle, setAngle] = useState("Dynamic");
  const [tonality, setTonality] = useState("Energetic");
  const [format, setFormat] = useState("DTC Product");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approvedCount = scenes.filter((s) => s.klingPromptApproved).length;

  async function handleGenerateScript() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle, tonality, format }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }
      const data = (await res.json()) as {
        fullScript: string;
        sceneSegments: string[];
      };
      onScriptChange(data.fullScript);
      scenes.forEach((scene, i) => {
        const prompt = data.sceneSegments[i] ?? "";
        if (prompt) {
          updateScene(scene.sceneId, {
            klingPrompt: prompt,
            klingPromptApproved: false,
          });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate-script]", msg);
      setError(msg);
    } finally {
      setGenerating(false);
    }
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

        {/* Error message */}
        {error && (
          <p className="mt-3 text-xs text-red-600">
            Failed to generate script: {error}
          </p>
        )}

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
