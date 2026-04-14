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
  Sparkles,
  Trash2,
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
import type { SceneProductionState, VideoJobStatus, VideoVersion } from "./types";

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
      return {
        text: "text-neutral-400",
        bg: "bg-neutral-50",
        dot: "bg-neutral-300",
      };
    case "queued":
      return {
        text: "text-amber-600",
        bg: "bg-amber-50",
        dot: "bg-amber-400",
      };
    case "processing":
      return { text: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-400" };
    case "completed":
      return {
        text: "text-emerald-600",
        bg: "bg-emerald-50",
        dot: "bg-emerald-500",
      };
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
            Low quality score — Scene{" "}
            {String(scene.sceneOrder).padStart(2, "0")}
          </DialogTitle>
          <DialogDescription>
            The generated video scored{" "}
            <span className="font-semibold text-red-600">
              {qs?.overall ?? "—"}/100
            </span>
            , which is below the 60-point threshold.
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
            onClick={() => {
              onRetry();
              onClose();
            }}
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
  projectId,
  updateScene,
  onGenerate,
  onGenerateWithPrompt,
}: {
  scene: SceneProductionState;
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  onGenerate: (sceneId: string) => Promise<void>;
  onGenerateWithPrompt: (sceneId: string, refinedPrompt: string, duration?: number) => Promise<void>;
}) {
  const [warningOpen, setWarningOpen] = useState(false);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [refining, setRefining] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [clipDuration, setClipDuration] = useState<5 | 10>(
    scene.targetClipDurationS <= 7.5 ? 5 : 10
  );
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
    setEnhanceOpen(true);
    setRefinedPrompt(scene.klingPrompt);
  }

  function handleRetry() {
    setEnhanceOpen(true);
    setRefinedPrompt(scene.klingPrompt);
  }

  async function handleEnhance() {
    setRefining(true);
    try {
      // Include AI instruction as part of the prompt if provided
      const promptToRefine = aiInstruction.trim()
        ? `${refinedPrompt || scene.klingPrompt}\n\n[USER INSTRUCTION: ${aiInstruction.trim()}]`
        : refinedPrompt || scene.klingPrompt;

      const res = await fetch(`/api/projects/${projectId}/refine-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToRefine,
          target: "kling_video",
          sceneId: scene.sceneId,
        }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      const { refined } = (await res.json()) as { refined: string };
      setRefinedPrompt(refined);
      setAiInstruction("");
    } catch (err) {
      console.error("[enhance-kling]", err);
    } finally {
      setRefining(false);
    }
  }

  function handleSubmit() {
    setEnhanceOpen(false);
    void onGenerateWithPrompt(scene.sceneId, refinedPrompt, clipDuration);
  }

  function handleRejectVideo(versionId: string) {
    // Optimistically hide
    updateScene(scene.sceneId, {
      videoVersions: scene.videoVersions.map((v) =>
        v.id === versionId ? { ...v, isRejected: true } : v
      ),
    });
    // Claude analyzes in background
    fetch(`/api/projects/${projectId}/reject-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetVersionId: versionId }),
    })
      .then((res) => res.json())
      .then(({ rejectionReason }: { rejectionReason: string }) => {
        updateScene(scene.sceneId, {
          videoVersions: scene.videoVersions.map((v) =>
            v.id === versionId ? { ...v, isRejected: true, rejectionReason } : v
          ),
        });
      })
      .catch(console.error);
  }

  const hasVersionHistory = scene.videoVersions && scene.videoVersions.length > 1;

  return (
    <div
      className={cn(
        "rounded-xl border bg-white overflow-hidden transition-all",
        expanded && "col-span-full",
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
      {/* Seed image or video thumbnail — click to expand */}
      <div
        onClick={() => hasVersionHistory && setExpanded(!expanded)}
        className={cn("aspect-[9/16] relative overflow-hidden", hasVersionHistory && "cursor-pointer")}
        style={{
          backgroundColor: scene.seedImageApproved ? scene.color : "#f5f5f5",
        }}
      >
        {/* Show approved seed image */}
        {scene.seedImageApproved &&
          scene.seedVersions.find(
            (v) => v.id === scene.approvedSeedVersionId
          )?.imageUrl && (
            <img
              src={
                scene.seedVersions.find(
                  (v) => v.id === scene.approvedSeedVersionId
                )!.imageUrl
              }
              alt={`Scene ${scene.sceneOrder} seed`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

        {/* Show completed video */}
        {scene.videoJobStatus === "completed" && scene.videoUrl && (
          <video
            src={scene.videoUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        )}

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
            <div
              className={cn(
                "rounded-full p-2",
                hasLowQuality ? "bg-amber-50/90" : "bg-white/90"
              )}
            >
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

        {/* Version count badge */}
        {hasVersionHistory && (
          <div className="absolute bottom-2 left-2">
            <span className="text-[10px] font-medium bg-black/40 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
              {scene.videoVersions.length} version{scene.videoVersions.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
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
          <p className="text-[11px] text-neutral-400">
            Prompt approval needed
          </p>
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
              <div className="flex items-center gap-3">
                {scene.videoUrl ? (
                  <a
                    href={scene.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    View
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Play className="h-3 w-3" />
                    Complete
                  </span>
                )}
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Rerun
                </button>
              </div>
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

      {/* Expanded version history */}
      {expanded && scene.videoVersions && scene.videoVersions.length > 0 && (() => {
        const active = scene.videoVersions.filter((v) => !v.isRejected);
        const rejected = scene.videoVersions.filter((v) => v.isRejected);
        return (
        <div className="border-t border-neutral-100 px-3 py-3">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-widest mb-2">
            Generations ({active.length})
            {rejected.length > 0 && (
              <span className="text-neutral-300 font-normal ml-1">
                ({rejected.length} rejected)
              </span>
            )}
          </p>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {[...active].reverse().map((v, i) => (
              <div
                key={v.id}
                className={cn(
                  "flex items-start gap-2.5 p-2 rounded-lg border transition-colors group/version",
                  i === 0 ? "border-emerald-200 bg-emerald-50/30" : "border-neutral-100 bg-neutral-50/50"
                )}
              >
                <video
                  src={v.fileUrl}
                  className="w-16 aspect-[9/16] rounded object-cover shrink-0"
                  muted
                  loop
                  playsInline
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={(e) => { const el = e.target as HTMLVideoElement; el.pause(); el.currentTime = 0; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      {i === 0 && (
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-400">
                        v{active.length - i}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRejectVideo(v.id)}
                      className="p-1 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/version:opacity-100 transition-all"
                      title="Reject — Claude will analyze why it's bad"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {v.prompt && (
                    <p className="text-[11px] text-neutral-500 leading-snug line-clamp-2">
                      {v.prompt}
                    </p>
                  )}
                  <a
                    href={v.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 mt-1 transition-colors"
                  >
                    <Play className="h-2.5 w-2.5" />
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Rejected versions */}
          {rejected.length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-600 transition-colors">
                {rejected.length} rejected — click to view
              </summary>
              <div className="mt-2 space-y-2">
                {rejected.map((v) => (
                  <div key={v.id} className="flex gap-2.5 p-2 rounded-lg bg-red-50/50 border border-red-100">
                    <video
                      src={v.fileUrl}
                      className="w-12 aspect-[9/16] rounded object-cover shrink-0 opacity-60"
                      muted
                      playsInline
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-red-500">Rejected</p>
                      {v.rejectionReason && (
                        <p className="text-[10px] text-neutral-500 leading-relaxed mt-0.5 whitespace-pre-line">
                          {v.rejectionReason}
                        </p>
                      )}
                      {!v.rejectionReason && (
                        <p className="text-[10px] text-neutral-300 italic mt-0.5">Analyzing...</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        );
      })()}

      {/* Quality warning dialog (low score) */}
      {scene.qualityScore != null && (
        <QualityWarningDialog
          scene={scene}
          open={warningOpen}
          onClose={() => setWarningOpen(false)}
          onRetry={handleRetry}
        />
      )}

      {/* Enhance prompt dialog before Kling generation */}
      <Dialog open={enhanceOpen} onOpenChange={setEnhanceOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Scene {String(scene.sceneOrder).padStart(2, "0")} — Kling Prompt
            </DialogTitle>
            <DialogDescription>
              Review and enhance the motion prompt before sending to Kling.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">
                Original prompt
              </p>
              <p className="text-xs text-neutral-400 bg-neutral-50 rounded px-3 py-2 leading-relaxed">
                {scene.klingPrompt}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">
                AI direction (optional)
              </p>
              <div className="flex gap-2">
                <input
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !refining) {
                      e.preventDefault();
                      handleEnhance();
                    }
                  }}
                  placeholder="e.g. add more realism, slow down the camera, make it more cinematic..."
                  className="flex-1 text-sm border border-neutral-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all placeholder:text-neutral-300"
                />
                <Button
                  onClick={handleEnhance}
                  disabled={refining}
                  variant="outline"
                  className="gap-2 h-auto text-xs shrink-0"
                >
                  {refining ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Enhancing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      Enhance
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-neutral-300 mt-1">
                Tell Claude how to adjust the prompt, or leave blank for auto-enhance
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-neutral-500 mb-1.5">
                {refinedPrompt !== scene.klingPrompt ? "Enhanced prompt (editable)" : "Prompt to send (editable)"}
              </p>
              <textarea
                value={refinedPrompt}
                onChange={(e) => setRefinedPrompt(e.target.value)}
                rows={4}
                className={cn(
                  "w-full text-sm rounded-md border px-3 py-2.5 resize-none focus:outline-none focus:ring-2 transition-all leading-relaxed",
                  refinedPrompt !== scene.klingPrompt
                    ? "border-blue-200 bg-blue-50/30 focus:ring-blue-200 focus:border-blue-300"
                    : "border-neutral-200 bg-white focus:ring-neutral-200 focus:border-neutral-300"
                )}
              />
              <p className="text-[11px] text-neutral-400 mt-1">
                {refinedPrompt.trim().split(/\s+/).length} words
                {refinedPrompt.trim().split(/\s+/).length > 40 && (
                  <span className="text-amber-500 ml-1">— Kling works best under 40 words</span>
                )}
              </p>
            </div>
          </div>
          <DialogFooter className="flex items-center !justify-between">
            <div className="flex items-center gap-2">
              <p className="text-xs text-neutral-500">Clip length:</p>
              <div className="flex rounded-md border border-neutral-200 overflow-hidden">
                <button
                  onClick={() => setClipDuration(5)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors",
                    clipDuration === 5
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-500 hover:bg-neutral-50"
                  )}
                >
                  5s
                </button>
                <button
                  onClick={() => setClipDuration(10)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium transition-colors border-l border-neutral-200",
                    clipDuration === 10
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-500 hover:bg-neutral-50"
                  )}
                >
                  10s
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEnhanceOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!refinedPrompt.trim()}
                className="bg-neutral-900 hover:bg-neutral-700 text-white text-xs gap-2"
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Generate {clipDuration}s
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const completed = scenes.filter(
    (s) => s.videoJobStatus === "completed"
  ).length;
  const failed = scenes.filter((s) => s.videoJobStatus === "failed").length;

  async function submitKlingJob(sceneId: string, refinedPrompt?: string, duration?: number) {
    updateScene(sceneId, { videoJobStatus: "queued", videoJobProgress: 0 });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "kling_generation",
          projectId,
          sceneId,
          ...(refinedPrompt ? { promptOverride: refinedPrompt } : {}),
          ...(duration ? { durationOverride: duration } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({
          error: `Request failed (${res.status})`,
        }))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateScene(sceneId, { videoJobStatus: "failed", videoJobError: msg });
    }
  }

  function handleGenerateAll() {
    scenes.forEach((scene) => {
      if (
        scene.seedImageApproved &&
        scene.klingPromptApproved &&
        scene.videoJobStatus === "idle"
      ) {
        void submitKlingJob(scene.sceneId);
      }
    });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>
            <span className="font-medium text-neutral-700">
              {readyScenes.length}
            </span>
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
              projectId={projectId}
              updateScene={updateScene}
              onGenerate={submitKlingJob}
              onGenerateWithPrompt={(sceneId, prompt, duration) => submitKlingJob(sceneId, prompt, duration)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
