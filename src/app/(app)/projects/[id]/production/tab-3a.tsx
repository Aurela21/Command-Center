"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Wand2 } from "lucide-react";
import type { SceneProductionState, SeedVersion } from "./types";

// ─── Scene list item (left panel) ────────────────────────────────────────────

function SceneListItem({
  scene,
  isSelected,
  onSelect,
}: {
  scene: SceneProductionState;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-neutral-100 transition-colors",
        isSelected ? "bg-neutral-900" : "hover:bg-neutral-50"
      )}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0 mt-1.5"
        style={{
          backgroundColor: isSelected ? "rgba(255,255,255,0.3)" : scene.color,
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={cn(
              "text-xs tabular-nums font-medium",
              isSelected ? "text-white/60" : "text-neutral-400"
            )}
          >
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "text-xs tabular-nums",
              isSelected ? "text-white/40" : "text-neutral-400"
            )}
          >
            {scene.targetClipDurationS.toFixed(1)}s
          </span>
          {scene.seedImageApproved && (
            <Check
              className={cn(
                "h-3 w-3",
                isSelected ? "text-emerald-400" : "text-emerald-500"
              )}
            />
          )}
          {scene.seedVersions.length > 0 && !scene.seedImageApproved && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                isSelected
                  ? "bg-white/10 text-white/60"
                  : "bg-neutral-100 text-neutral-500"
              )}
            >
              {scene.seedVersions.length}v
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-xs leading-snug line-clamp-2",
            isSelected ? "text-white/70" : "text-neutral-500"
          )}
        >
          {scene.description}
        </p>
      </div>
    </button>
  );
}

// ─── Seed detail panel (right panel) ─────────────────────────────────────────

function SeedDetailPanel({
  scene,
  updateScene,
}: {
  scene: SceneProductionState;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
}) {
  const [generating, setGenerating] = useState(false);

  function handleGenerate() {
    setGenerating(true);
    // Mock: add a version after a short delay.
    // Production: POST /api/jobs with { jobType: "nano_banana", sceneId, ... }
    setTimeout(() => {
      const newVersion: SeedVersion = {
        id: `v-${Date.now()}`,
        createdAt: new Date().toISOString(),
        qualityScore: Math.floor(Math.random() * 30) + 65, // 65–95
        color: scene.color,
      };
      updateScene(scene.sceneId, {
        seedVersions: [...scene.seedVersions, newVersion],
      });
      setGenerating(false);
    }, 1500);
  }

  function handleApproveSeed(versionId: string) {
    updateScene(scene.sceneId, {
      approvedSeedVersionId: versionId,
      seedImageApproved: true,
    });
  }

  function handleUnapprove() {
    updateScene(scene.sceneId, {
      approvedSeedVersionId: null,
      seedImageApproved: false,
    });
  }

  return (
    <div className="p-7 space-y-7 max-w-2xl">
      {/* Scene header */}
      <div className="flex items-end gap-4">
        <span className="text-7xl font-light leading-none text-neutral-100 tabular-nums select-none">
          {String(scene.sceneOrder).padStart(2, "0")}
        </span>
        <div className="mb-1 space-y-1">
          <p className="text-sm font-medium text-neutral-700">
            {scene.targetClipDurationS.toFixed(1)}s target clip
          </p>
          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2 max-w-sm">
            {scene.description}
          </p>
        </div>
      </div>

      {/* Reference frame */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Reference Frame
        </p>
        <div
          className="w-44 aspect-video rounded-lg border border-neutral-100 flex items-end justify-end p-2"
          style={{ backgroundColor: scene.color }}
        >
          <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-white/80 px-1.5 py-0.5 rounded leading-none">
            f{scene.referenceFrame}
          </span>
        </div>
      </div>

      {/* Nano Banana prompt */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Nano Banana Prompt
        </p>
        <textarea
          value={scene.nanoBananaPrompt}
          onChange={(e) =>
            updateScene(scene.sceneId, { nanoBananaPrompt: e.target.value })
          }
          rows={4}
          placeholder="Describe the seed image to generate from this reference frame…"
          className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 transition-all placeholder:text-neutral-400"
        />
        <Button
          onClick={handleGenerate}
          disabled={generating || !scene.nanoBananaPrompt.trim()}
          className="mt-2.5 gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5" />
              Generate Seed Image
            </>
          )}
        </Button>
      </div>

      {/* Generated versions */}
      {scene.seedVersions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
            Generated Versions
          </p>
          <div className="grid grid-cols-3 gap-3">
            {scene.seedVersions.map((v, i) => {
              const isApproved = v.id === scene.approvedSeedVersionId;
              return (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-lg border-2 overflow-hidden transition-all",
                    isApproved
                      ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-1"
                      : "border-neutral-100 hover:border-neutral-300"
                  )}
                >
                  <div
                    className="aspect-video relative"
                    style={{ backgroundColor: scene.color }}
                  >
                    {isApproved && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="bg-white rounded-full p-1">
                          <Check className="h-3.5 w-3.5 text-neutral-900" />
                        </div>
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-white/80 px-1 py-0.5 rounded leading-none">
                      v{i + 1}
                    </span>
                  </div>
                  <div className="px-2.5 py-2 bg-white flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        v.qualityScore >= 80
                          ? "text-emerald-600"
                          : v.qualityScore >= 65
                          ? "text-amber-600"
                          : "text-red-500"
                      )}
                    >
                      {v.qualityScore}
                    </span>
                    <button
                      onClick={() =>
                        isApproved ? handleUnapprove() : handleApproveSeed(v.id)
                      }
                      className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded transition-colors",
                        isApproved
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                      )}
                    >
                      {isApproved ? "Approved" : "Approve"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-neutral-200 rounded-xl">
          <Wand2 className="h-8 w-8 text-neutral-200 mb-3" />
          <p className="text-sm text-neutral-400">No seed images yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            Add a prompt above and click Generate
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tab3A ────────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
};

export function Tab3A({ scenes, updateScene }: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    scenes[0]?.sceneId ?? ""
  );
  const selected = scenes.find((s) => s.sceneId === selectedId) ?? scenes[0];
  const approvedCount = scenes.filter((s) => s.seedImageApproved).length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Scene list (left, fixed width) */}
      <div className="w-72 shrink-0 border-r border-neutral-200 overflow-y-auto bg-white">
        <div className="px-4 py-2.5 border-b border-neutral-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <p className="text-xs text-neutral-400">
            {approvedCount}/{scenes.length} seeds approved
          </p>
        </div>
        {scenes.map((scene) => (
          <SceneListItem
            key={scene.sceneId}
            scene={scene}
            isSelected={scene.sceneId === selectedId}
            onSelect={() => setSelectedId(scene.sceneId)}
          />
        ))}
      </div>

      {/* Detail panel (right, scrollable) */}
      <div className="flex-1 overflow-y-auto">
        {selected && (
          <SeedDetailPanel
            key={selected.sceneId}
            scene={selected}
            updateScene={updateScene}
          />
        )}
      </div>
    </div>
  );
}
