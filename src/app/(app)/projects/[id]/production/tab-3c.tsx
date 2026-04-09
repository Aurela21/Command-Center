"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Clapperboard,
  Loader2,
  Play,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SceneProductionState, VideoJobStatus } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status: VideoJobStatus): string {
  switch (status) {
    case "idle":
      return "Ready";
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
  }
}

function statusColor(
  status: VideoJobStatus
): { text: string; bg: string; dot: string } {
  switch (status) {
    case "idle":
      return { text: "text-neutral-400", bg: "bg-neutral-50", dot: "bg-neutral-300" };
    case "queued":
      return { text: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-400" };
    case "processing":
      return { text: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-400" };
    case "completed":
      return { text: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" };
    case "failed":
      return { text: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" };
  }
}

// ─── Quality warning dialog ───────────────────────────────────────────────────

function QualityWarningDialog({
  scene,
  open,
  onClose,
  onRetry,
}: {
  scene: SceneProductionState;
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  const qs = scene.qualityScore;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            Low quality score — Scene {String(scene.sceneOrder).padStart(2, "0")}
          </DialogTitle>
          <DialogDescription>
            The generated video scored{" "}
            <span className="font-semibold text-red-600">{qs?.overall ?? "—"}/100</span>,
            which is below the 60-point threshold.
            {qs?.notes && (
              <span className="block mt-1.5 text-neutral-600 italic">
                &ldquo;{qs.notes}&rdquo;
              </span>
            )}
            {qs?.lipSyncRisk && (
              <span className="flex items-center gap-1.5 mt-2 text-amber-600 font-medium">
                <Zap className="h-3.5 w-3.5" />
                Lip sync risk detected
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep it
          </Button>
          <Button
            onClick={() => { onRetry(); onClose(); }}
            className="bg-neutral-900 hover:bg-neutral-700 text-white gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry generation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Scene generation card ────────────────────────────────────────────────────

function SceneGenerationCard({
  scene,
  updateScene,
  projectId,
}: {
  scene: SceneProductionState;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  projectId: string;
}) {
  const [warningOpen, setWarningOpen] = useState(false);
  const colors = statusColor(scene.videoJobStatus);
  const canGenerate =
    scene.seedImageApproved &&
    scene.klingPromptApproved &&
    (scene.videoJobStatus === "idle" || scene.videoJobStatus === "failed");
  const canRetry = scene.videoJobStatus === "failed";
  const hasLowQuality =
    scene.videoJobStatus === "completed" &&
    scene.qualityScore != null &&
    scene.qualityScore.overall < 60;

  function handleGenerate() {
    // Queue the job. Production: POST /api/jobs → createJob → submitKlingJob
    updateScene(scene.sceneId, { videoJobStatus: "queued", videoJobProgress: 0 });
  }

  function handleRetry() {
    // POST /api/jobs/:id/retry → requeueJob
    updateScene(scene.sceneId, {
      videoJobStatus: "queued",
      videoJobProgress: 0,
      videoJobError: undefined,
      qualityScore: undefined,
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-white overflow-hidden transition-all",
        scene.videoJobStatus === "completed"
          ? hasLowQuality
            ? "border-amber-300"
            : "border-emerald-200"
          : scene.videoJobStatus === "failed"
          ? "border-red-200"
          : scene.videoJobStatus === "processing"
          ? "border-blue-200"
          : "border-neutral-100"
      )}
    >
      {/* Seed image placeholder */}
      <div
        className="aspect-video relative"
        style={{
          backgroundColor: scene.seedImageApproved ? scene.color : "#f5f5f5",
        }}
      >
        {/* Status overlay for active states */}
        {scene.videoJobStatus === "processing" && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <div className="bg-white/90 rounded-full p-2">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            </div>
          </div>
        )}
        {scene.videoJobStatus === "completed" && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <div className={cn("rounded-full p-2", hasLowQuality ? "bg-amber-50/90" : "bg-white/90")}>
              {hasLowQuality ? (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              )}
            </div>
          </div>
        )}
        {scene.videoJobStatus === "failed" && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <div className="bg-white/90 rounded-full p-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        )}
        {!scene.seedImageApproved && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Clapperboard className="h-8 w-8 text-neutral-200" />
          </div>
        )}

        {/* Scene number badge */}
        <div className="absolute top-2 left-2">
          <span className="text-xs font-semibold tabular-nums bg-black/30 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
        </div>

        {/* Duration badge */}
        <div className="absolute top-2 right-2">
          <span className="text-[10px] tabular-nums bg-black/30 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            {scene.targetClipDurationS.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3 space-y-2.5">
        {/* Prompt snippet */}
        <p className="text-xs text-neutral-500 leading-snug line-clamp-2 min-h-[2.5rem]">
          {scene.klingPrompt || (
            <span className="text-neutral-300 italic">No prompt set</span>
          )}
        </p>

        {/* Status row */}
        <div className="flex items-center gap-1.5">
          <div
            className={cn("w-1.5 h-1.5 rounded-full shrink-0", colors.dot)}
          />
          <span className={cn("text-xs font-medium", colors.text)}>
            {statusLabel(scene.videoJobStatus)}
          </span>
          {scene.videoJobStatus === "processing" && (
            <span className="text-xs text-neutral-400 tabular-nums ml-auto">
              {scene.videoJobProgress}%
            </span>
          )}
        </div>

        {/* Progress bar (only when processing) */}
        {scene.videoJobStatus === "processing" && (
          <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${scene.videoJobProgress}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {scene.videoJobStatus === "failed" && scene.videoJobError && (
          <p className="text-[11px] text-red-500 leading-snug">
            {scene.videoJobError}
          </p>
        )}

        {/* Missing prerequisites */}
        {!scene.seedImageApproved && (
          <p className="text-[11px] text-neutral-400">Seed image needed</p>
        )}
        {scene.seedImageApproved && !scene.klingPromptApproved && (
          <p className="text-[11px] text-neutral-400">Prompt approval needed</p>
        )}

        {/* Action button */}
        <div className="pt-0.5">
          {canRetry ? (
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          ) : scene.videoJobStatus === "completed" ? (
            <div className="flex items-center justify-between">
              <button className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors">
                <Play className="h-3 w-3" />
                View output
              </button>
              {scene.qualityScore != null && (
                <button
                  onClick={() => setWarningOpen(true)}
                  className={cn(
                    "text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full transition-colors",
                    scene.qualityScore.overall < 60
                      ? "bg-red-50 text-red-600 hover:bg-red-100"
                      : scene.qualityScore.overall < 80
                      ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
                      : "bg-emerald-50 text-emerald-600"
                  )}
                >
                  {scene.qualityScore.overall}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || scene.videoJobStatus === "queued"}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-colors",
                canGenerate && scene.videoJobStatus === "idle"
                  ? "text-neutral-700 hover:text-neutral-900"
                  : "text-neutral-300 cursor-not-allowed"
              )}
            >
              {scene.videoJobStatus === "queued" ? (
                <>
                  <Clock className="h-3 w-3" />
                  Queued
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Generate
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Quality warning dialog (low score) */}
      {scene.qualityScore != null && (
        <QualityWarningDialog
          scene={scene}
          open={warningOpen}
          onClose={() => setWarningOpen(false)}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

// ─── Tab3C ────────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  projectId: string;
};

export function Tab3C({ scenes, updateScene, projectId }: Props) {
  const readyScenes = scenes.filter(
    (s) => s.seedImageApproved && s.klingPromptApproved
  );
  const queuedOrProcessing = scenes.filter((s) =>
    ["queued", "processing"].includes(s.videoJobStatus)
  ).length;
  const completed = scenes.filter((s) => s.videoJobStatus === "completed").length;
  const failed = scenes.filter((s) => s.videoJobStatus === "failed").length;

  function handleGenerateAll() {
    // Queue all scenes that have both seed + prompt approved and aren't already running
    scenes.forEach((scene) => {
      if (
        scene.seedImageApproved &&
        scene.klingPromptApproved &&
        scene.videoJobStatus === "idle"
      ) {
        // Production: POST /api/jobs → createJob → submitKlingJob per scene
        updateScene(scene.sceneId, { videoJobStatus: "queued", videoJobProgress: 0 });
      }
    });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>
            <span className="font-medium text-neutral-700">{readyScenes.length}</span>
            /{scenes.length} ready
          </span>
          {queuedOrProcessing > 0 && (
            <span className="text-blue-600">
              <span className="font-medium">{queuedOrProcessing}</span> running
            </span>
          )}
          {completed > 0 && (
            <span className="text-emerald-600">
              <span className="font-medium">{completed}</span> complete
            </span>
          )}
          {failed > 0 && (
            <span className="text-red-600">
              <span className="font-medium">{failed}</span> failed
            </span>
          )}
        </div>
        <Button
          onClick={handleGenerateAll}
          disabled={readyScenes.length === 0}
          className="gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" />
          Generate All
        </Button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-4">
          {scenes.map((scene) => (
            <SceneGenerationCard
              key={scene.sceneId}
              scene={scene}
              updateScene={updateScene}
              projectId={projectId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
