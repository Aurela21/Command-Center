"use client";

import { cn } from "@/lib/utils";
import { Check, ExternalLink, ImageOff, FileText } from "lucide-react";
import type { SceneProductionState } from "./types";

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums text-neutral-500 shrink-0 w-10 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

// ─── Scene pair row ───────────────────────────────────────────────────────────

function ScenePairRow({
  scene,
  onEditSeed,
  onEditPrompt,
}: {
  scene: SceneProductionState;
  onEditSeed: () => void;
  onEditPrompt: () => void;
}) {
  return (
    <div className="flex gap-5 py-5 border-b border-neutral-100 last:border-0">
      {/* Scene label */}
      <div className="w-10 shrink-0 pt-1 text-center">
        <div
          className="w-2.5 h-2.5 rounded-full mx-auto mb-1"
          style={{ backgroundColor: scene.color }}
        />
        <span className="text-xs tabular-nums font-medium text-neutral-400">
          {String(scene.sceneOrder).padStart(2, "0")}
        </span>
        <p className="text-[10px] text-neutral-300 tabular-nums mt-0.5">
          {scene.targetClipDurationS.toFixed(1)}s
        </p>
      </div>

      {/* Seed image */}
      <div className="shrink-0">
        {(() => {
          const approvedVersion = scene.seedVersions.find(
            (v) => v.id === scene.approvedSeedVersionId
          );
          const imgUrl = approvedVersion?.imageUrl ?? scene.referenceFrameUrl;
          return (
            <div
              className={cn(
                "w-20 aspect-[9/16] rounded-lg border relative overflow-hidden flex items-center justify-center",
                scene.seedImageApproved
                  ? "border-emerald-200"
                  : "border-neutral-100 border-dashed"
              )}
              style={{ backgroundColor: imgUrl ? undefined : scene.color }}
            >
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={`Scene ${scene.sceneOrder} seed`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <ImageOff className="h-4 w-4 text-neutral-200" />
              )}
              {scene.seedImageApproved && (
                <div className="absolute top-1 left-1">
                  <div className="bg-emerald-500 rounded-full p-0.5">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        <button
          onClick={onEditSeed}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Edit seed
        </button>
      </div>

      {/* Kling prompt */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-lg border px-3.5 py-3 h-full min-h-[72px] flex flex-col justify-between",
            scene.klingPromptApproved
              ? "border-emerald-200 bg-emerald-50/30"
              : "border-neutral-100 bg-neutral-50"
          )}
        >
          {scene.klingPrompt ? (
            <>
              <p className="text-sm text-neutral-600 leading-relaxed line-clamp-3">
                {scene.klingPrompt}
              </p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-neutral-400">
                  {scene.klingPrompt.trim().split(/\s+/).length}w
                </span>
                {scene.klingPromptApproved && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <Check className="h-3 w-3" />
                    Approved
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-neutral-300">
              <FileText className="h-4 w-4" />
              <span className="text-xs">No prompt yet</span>
            </div>
          )}
        </div>
        <button
          onClick={onEditPrompt}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Edit prompt
        </button>
      </div>
    </div>
  );
}

// ─── TabReview ────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  onGoTo3A: () => void;
  onGoTo3B: () => void;
};

export function TabReview({ scenes, onGoTo3A, onGoTo3B }: Props) {
  const seedsApproved = scenes.filter((s) => s.seedImageApproved).length;
  const promptsApproved = scenes.filter((s) => s.klingPromptApproved).length;
  const bothApproved = scenes.filter(
    (s) => s.seedImageApproved && s.klingPromptApproved
  ).length;

  const ready = bothApproved === scenes.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-6">
        {/* Progress summary */}
        <div className="mb-7 p-5 rounded-xl border border-neutral-100 bg-neutral-50/50 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-neutral-700">
              Production readiness
            </p>
            {ready && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                <Check className="h-3.5 w-3.5" />
                Ready for 3C
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            <div>
              <p className="text-xs text-neutral-500 mb-1.5">Seed images</p>
              <ProgressBar value={seedsApproved} max={scenes.length} color="#10b981" />
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1.5">Kling prompts</p>
              <ProgressBar value={promptsApproved} max={scenes.length} color="#6366f1" />
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1.5">Pairs complete</p>
              <ProgressBar value={bothApproved} max={scenes.length} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Scene pairs */}
        <div>
          {scenes.map((scene) => (
            <ScenePairRow
              key={scene.sceneId}
              scene={scene}
              onEditSeed={onGoTo3A}
              onEditPrompt={onGoTo3B}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
