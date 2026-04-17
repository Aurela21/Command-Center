"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Clapperboard,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
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
import { PromptWithMentions } from "./tab-3a";
import type { ProductTag } from "./tab-3a";
import { Pencil } from "lucide-react";

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
        text: "text-[#71717a]",
        bg: "bg-[#09090b]",
        dot: "bg-[#52525b]",
      };
    case "queued":
      return {
        text: "text-amber-400",
        bg: "bg-amber-500/10",
        dot: "bg-amber-400",
      };
    case "processing":
      return { text: "text-blue-400", bg: "bg-blue-500/10", dot: "bg-blue-400" };
    case "completed":
      return {
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        dot: "bg-emerald-500",
      };
    case "failed":
      return { text: "text-red-400", bg: "bg-red-500/10", dot: "bg-red-500" };
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
              <span className="block mt-1.5 text-[#a1a1aa] italic">
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
            className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry generation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit & Regenerate inline panel ──────────────────────────────────────────

function EditRegeneratePanel({
  originalPrompt,
  projectId,
  sceneId,
  onRegenerate,
}: {
  originalPrompt: string;
  projectId: string;
  sceneId: string;
  onRegenerate: (refinedPrompt: string, duration?: number) => void;
}) {
  const [editInstruction, setEditInstruction] = useState("");
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [duration, setDuration] = useState(5);

  async function handleRefine() {
    if (!editInstruction.trim()) return;
    setRefining(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/refine-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${originalPrompt}\n\n[USER EDIT: The previous generation has issues. Fix these specific problems: ${editInstruction.trim()}]\n\nRewrite the prompt to address these issues while keeping the same scene, subject, and motion intent. Focus the rewrite on avoiding the described artifacts.`,
          target: "kling_video",
          sceneId,
        }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      const { refined } = (await res.json()) as { refined: string };
      setRefinedPrompt(refined);
    } catch (err) {
      console.error("[edit-regenerate]", err);
    } finally {
      setRefining(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-[#27272a] pt-2">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[#71717a]">
        Edit & Regenerate
      </p>
      {/* Original prompt reference */}
      <p className="text-[10px] text-[#52525b] leading-relaxed line-clamp-2">
        Original: {originalPrompt}
      </p>
      {/* Edit instruction */}
      <textarea
        value={editInstruction}
        onChange={(e) => setEditInstruction(e.target.value)}
        placeholder="Describe what to fix… e.g. reduce hand artifacting, smoother camera pan, less jittery motion"
        rows={2}
        className="w-full text-xs rounded-md border border-[#27272a] bg-[#09090b] px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1]/30 transition-all text-[#e4e4e7] leading-relaxed placeholder:text-[#52525b]"
      />
      {!refinedPrompt ? (
        <Button
          onClick={handleRefine}
          disabled={refining || !editInstruction.trim()}
          size="sm"
          className="gap-1.5 h-7 text-[11px] bg-[#6366f1] hover:bg-[#6366f1]/80 text-white w-full disabled:opacity-40"
        >
          {refining ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Rewriting prompt…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Rewrite Prompt
            </>
          )}
        </Button>
      ) : (
        <div className="space-y-2">
          <textarea
            value={refinedPrompt}
            onChange={(e) => setRefinedPrompt(e.target.value)}
            rows={3}
            className="w-full text-xs rounded-md border border-blue-500/20 bg-blue-500/5 px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-[#e4e4e7] leading-relaxed"
          />
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-[#27272a] overflow-hidden">
              {[3, 4, 5, 6, 7, 8].map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium transition-colors",
                    i > 0 && "border-l border-[#27272a]",
                    duration === d
                      ? "bg-[#6366f1] text-white"
                      : "bg-[#18181b] text-[#a1a1aa] hover:bg-[#27272a]"
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>
            <Button
              onClick={() => onRegenerate(refinedPrompt, duration)}
              size="sm"
              className="gap-1.5 h-7 text-[11px] bg-[#6366f1] hover:bg-[#6366f1]/80 text-white flex-1"
            >
              <Clapperboard className="h-3 w-3" />
              Regenerate {duration}s
            </Button>
          </div>
        </div>
      )}
    </div>
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
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [refinedPrompt, setRefinedPrompt] = useState("");
  const [refining, setRefining] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [productTags, setProductTags] = useState<ProductTag[]>([]);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((products: ProductTag[]) => setProductTags(products.filter((p) => (p.imageCount ?? 0) > 0)))
      .catch(() => {});
  }, []);
  const [clipDuration, setClipDuration] = useState(
    Math.max(3, Math.min(7, Math.round(scene.targetClipDurationS ?? 5)))
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
    // Always use the current scene prompt (reflects edits from 3A)
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

  function handleApproveVideo(versionId: string) {
    // Optimistic update
    updateScene(scene.sceneId, {
      videoVersions: scene.videoVersions.map((v) =>
        v.id === versionId ? { ...v, isApproved: true } : v
      ),
    });
    // Record positive learning in background
    fetch(`/api/projects/${projectId}/approve-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetVersionId: versionId }),
    }).catch(console.error);
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

  const hasVersions = scene.videoVersions && scene.videoVersions.length > 0;

  return (
    <div
      className={cn(
        "rounded-xl border bg-[#18181b] overflow-hidden transition-all",
        expanded && "col-span-2",
        scene.videoJobStatus === "completed"
          ? hasLowQuality
            ? "border-amber-500/30"
            : "border-emerald-500/20"
          : scene.videoJobStatus === "failed"
          ? "border-red-500/20"
          : scene.videoJobStatus === "processing"
          ? "border-blue-500/20"
          : "border-[#1a1a1e]"
      )}
    >
      {/* Seed image or video thumbnail — click to expand */}
      <div
        onClick={() => hasVersions && setExpanded(!expanded)}
        className={cn("aspect-[9/16] relative overflow-hidden", hasVersions && "cursor-pointer")}
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
        {scene.videoJobStatus === "completed" && (() => {
          const hasApproved = scene.videoVersions.some((v) => v.isApproved && !v.isRejected);
          return (
            <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
              <div
                className={cn(
                  "rounded-full p-2",
                  hasLowQuality ? "bg-amber-50/90" : hasApproved ? "bg-emerald-50/90" : "bg-white/90"
                )}
              >
                {hasLowQuality ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                ) : hasApproved ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <Play className="h-5 w-5 text-[#71717a]" />
                )}
              </div>
            </div>
          );
        })()}
        {scene.videoJobStatus === "failed" && (
          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
            <div className="bg-white/90 rounded-full p-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        )}
        {!scene.seedImageApproved && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Clapperboard className="h-8 w-8 text-[#27272a]" />
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
        {hasVersions && (
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
        <p className="text-xs text-[#a1a1aa] leading-snug line-clamp-2 min-h-[2.5rem]">
          {scene.klingPrompt || (
            <span className="text-[#52525b] italic">No prompt set</span>
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
            <span className="text-xs text-[#71717a] tabular-nums ml-auto">
              {scene.videoJobProgress}%
            </span>
          )}
        </div>

        {/* Progress bar (only when processing) */}
        {scene.videoJobStatus === "processing" && (
          <div className="h-1 bg-[#27272a] rounded-full overflow-hidden">
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
          <p className="text-[11px] text-[#71717a]">Seed image needed</p>
        )}
        {scene.seedImageApproved && !scene.klingPromptApproved && (
          <p className="text-[11px] text-[#71717a]">
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
            <div className="space-y-2">
              {/* Approve / Reject row — always visible on the main card */}
              {(() => {
                const latest = scene.videoVersions.find((v) => !v.isRejected);
                const anyApproved = scene.videoVersions.some((v) => v.isApproved && !v.isRejected);
                if (!latest) return null;
                return anyApproved ? (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approved
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApproveVideo(latest.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectVideo(latest.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Reject
                    </button>
                    {scene.qualityScore != null && (
                      <button
                        onClick={() => setWarningOpen(true)}
                        className={cn(
                          "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full transition-colors ml-auto",
                          scene.qualityScore.overall < 60
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : scene.qualityScore.overall < 80
                            ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400"
                        )}
                      >
                        {scene.qualityScore.overall}
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Action links */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const latest = scene.videoVersions.filter((v) => !v.isRejected).at(-1);
                    setRefinedPrompt(latest?.prompt || scene.klingPrompt);
                    setEnhanceOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#6366f1] hover:text-[#818cf8] transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Edit & Regen
                </button>
                <button
                  onClick={() => void onGenerate(scene.sceneId)}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#71717a] hover:text-[#a1a1aa] transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  Rerun
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || scene.videoJobStatus === "queued"}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium transition-colors",
                canGenerate && scene.videoJobStatus === "idle"
                  ? "text-[#a1a1aa] hover:text-[#fafafa]"
                  : "text-[#52525b] cursor-not-allowed"
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
        <div className="border-t border-[#1a1a1e] px-3 py-3">
          <p className="text-[11px] font-medium text-[#71717a] uppercase tracking-widest mb-2">
            Generations ({active.length})
            {rejected.length > 0 && (
              <span className="text-[#52525b] font-normal ml-1">
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
                  v.isApproved
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : i === 0 ? "border-[#27272a] bg-[#09090b]/50" : "border-[#1a1a1e] bg-[#09090b]/50"
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
                      {v.isApproved && (
                        <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Approved
                        </span>
                      )}
                      {i === 0 && !v.isApproved && (
                        <span className="text-[10px] font-medium text-[#a1a1aa] bg-[#27272a] px-1.5 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                      <span className="text-[10px] text-[#71717a]">
                        v{active.length - i}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!v.isApproved && (
                        <button
                          onClick={() => handleApproveVideo(v.id)}
                          className="p-1 rounded text-[#52525b] hover:text-emerald-500 hover:bg-emerald-500/10 opacity-0 group-hover/version:opacity-100 transition-all"
                          title="Approve — records positive learning"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fetch(v.fileUrl)
                            .then((r) => r.blob())
                            .then((blob) => {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `scene-${String(scene.sceneOrder).padStart(2, "0")}-v${active.length - i}.mp4`;
                              a.click();
                              URL.revokeObjectURL(url);
                            });
                        }}
                        className="p-1 rounded text-[#52525b] hover:text-blue-500 hover:bg-blue-500/10 opacity-0 group-hover/version:opacity-100 transition-all"
                        title="Download this version"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setEditingVersionId(editingVersionId === v.id ? null : v.id)}
                        className={cn(
                          "p-1 rounded transition-all",
                          editingVersionId === v.id
                            ? "text-[#6366f1] bg-[#6366f1]/10"
                            : "text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a] opacity-0 group-hover/version:opacity-100"
                        )}
                        title="Edit & Regenerate"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {!v.isApproved && (
                        <button
                          onClick={() => handleRejectVideo(v.id)}
                          className="p-1 rounded text-[#52525b] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/version:opacity-100 transition-all"
                          title="Reject — records negative learning"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  {v.prompt && (
                    <p className="text-[11px] text-[#a1a1aa] leading-snug line-clamp-2">
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
                  {editingVersionId === v.id && (
                    <EditRegeneratePanel
                      originalPrompt={v.prompt || scene.klingPrompt}
                      projectId={projectId}
                      sceneId={scene.sceneId}
                      onRegenerate={(prompt, dur) => {
                        setEditingVersionId(null);
                        void onGenerateWithPrompt(scene.sceneId, prompt, dur);
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Rejected versions */}
          {rejected.length > 0 && (
            <details className="mt-3">
              <summary className="text-[11px] text-[#71717a] cursor-pointer hover:text-[#a1a1aa] transition-colors">
                {rejected.length} rejected — click to view
              </summary>
              <div className="mt-2 space-y-2">
                {rejected.map((v) => (
                  <div key={v.id} className="flex gap-2.5 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                    <video
                      src={v.fileUrl}
                      className="w-12 aspect-[9/16] rounded object-cover shrink-0 opacity-60"
                      muted
                      playsInline
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-red-500">Rejected</p>
                      {v.rejectionReason && (
                        <p className="text-[10px] text-[#a1a1aa] leading-relaxed mt-0.5 whitespace-pre-line">
                          {v.rejectionReason}
                        </p>
                      )}
                      {!v.rejectionReason && (
                        <p className="text-[10px] text-[#52525b] italic mt-0.5">Analyzing...</p>
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

      {/* Enhance prompt — right side panel (video stays visible) */}
      {enhanceOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 bg-[#18181b] border-l border-[#27272a] shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#27272a] shrink-0">
            <div>
              <p className="text-sm font-medium text-[#fafafa]">
                Scene {String(scene.sceneOrder).padStart(2, "0")} — Edit & Regen
              </p>
              <p className="text-[11px] text-[#71717a]">
                Review the motion prompt while watching the video
              </p>
            </div>
            <button
              onClick={() => setEnhanceOpen(false)}
              className="p-1.5 rounded-lg text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Latest generation prompt if different */}
            {(() => {
              const latestVersion = [...scene.videoVersions].filter((v) => !v.isRejected).reverse()[0];
              const lastPrompt = latestVersion?.prompt;
              return lastPrompt && lastPrompt !== scene.klingPrompt ? (
                <div>
                  <p className="text-[11px] font-medium text-blue-400 mb-1">
                    Last generation prompt
                  </p>
                  <p className="text-xs text-[#a1a1aa] bg-blue-500/10 border border-blue-500/20 rounded px-3 py-2 leading-relaxed">
                    {lastPrompt}
                  </p>
                </div>
              ) : null;
            })()}

            {/* Base scene prompt */}
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa] mb-1">
                Base scene prompt
              </p>
              <p className="text-xs text-[#71717a] bg-[#09090b] rounded px-3 py-2 leading-relaxed">
                {scene.klingPrompt}
              </p>
            </div>

            {/* AI direction */}
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa] mb-1">
                Describe what to fix
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <PromptWithMentions
                    value={aiInstruction}
                    onChange={setAiInstruction}
                    products={productTags}
                    placeholder="e.g. reduce hand artifacts, smoother camera, less jitter..."
                    rows={2}
                  />
                </div>
              </div>
              <Button
                onClick={handleEnhance}
                disabled={refining}
                variant="outline"
                className="gap-2 h-8 text-xs mt-2 w-full"
              >
                {refining ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    Rewrite Prompt
                  </>
                )}
              </Button>
            </div>

            {/* Editable prompt */}
            <div>
              <p className="text-[11px] font-medium text-[#a1a1aa] mb-1">
                {refinedPrompt !== scene.klingPrompt ? "Rewritten prompt (editable)" : "Prompt to send (editable)"}
              </p>
              <textarea
                value={refinedPrompt}
                onChange={(e) => setRefinedPrompt(e.target.value)}
                rows={5}
                className={cn(
                  "w-full text-xs rounded-md border px-3 py-2.5 resize-none focus:outline-none focus:ring-2 transition-all leading-relaxed",
                  refinedPrompt !== scene.klingPrompt
                    ? "border-blue-500/20 bg-blue-500/5 focus:ring-blue-500/30 text-[#e4e4e7]"
                    : "border-[#27272a] bg-[#09090b] focus:ring-[#27272a] text-[#a1a1aa]"
                )}
              />
              <p className="text-[11px] text-[#52525b] mt-1">
                {refinedPrompt.trim().split(/\s+/).length} words
                {refinedPrompt.trim().split(/\s+/).length > 40 && (
                  <span className="text-amber-500 ml-1">— Kling works best under 40 words</span>
                )}
              </p>
            </div>
          </div>

          {/* Footer — duration + generate */}
          <div className="shrink-0 px-5 py-3 border-t border-[#27272a] space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-[#71717a]">Clip:</p>
              <div className="flex rounded-md border border-[#27272a] overflow-hidden flex-1">
                {[3, 4, 5, 6, 7, 8].map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setClipDuration(d)}
                    className={cn(
                      "flex-1 py-1 text-[11px] font-medium transition-colors",
                      i > 0 && "border-l border-[#27272a]",
                      clipDuration === d
                        ? "bg-[#6366f1] text-white"
                        : "bg-[#09090b] text-[#a1a1aa] hover:bg-[#27272a]"
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!refinedPrompt.trim()}
              className="w-full bg-[#6366f1] hover:bg-[#6366f1]/80 text-white text-xs gap-2 h-9"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              Generate {clipDuration}s
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab3C ────────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  projectId: string;
  projectName?: string;
};

export function Tab3C({ scenes, updateScene, projectId, projectName }: Props) {
  const [downloading, setDownloading] = useState(false);
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

  async function handleDownloadAll() {
    // Pick the best version per completed scene: approved > latest non-rejected
    const versionIds: string[] = [];
    for (const s of scenes) {
      if (s.videoJobStatus !== "completed" || s.videoVersions.length === 0) continue;
      const approved = s.videoVersions.find((v) => v.isApproved && !v.isRejected);
      const latestNonRejected = s.videoVersions.find((v) => !v.isRejected);
      const pick = approved ?? latestNonRejected;
      if (pick) versionIds.push(pick.id);
    }
    if (versionIds.length === 0) return;

    setDownloading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/download-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionIds }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (projectName ?? "videos")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      a.download = `${slug}-videos.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[download-all]", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 px-8 py-4 border-b border-[#1a1a1e] bg-[#09090b]/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-[#a1a1aa]">
          <span>
            <span className="font-medium text-[#a1a1aa]">
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
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownloadAll}
            disabled={completed === 0 || downloading}
            variant="outline"
            className="gap-2 h-9 text-sm border-[#27272a] text-[#a1a1aa] hover:text-white disabled:opacity-40"
          >
            {downloading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Zipping…
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Download All
              </>
            )}
          </Button>
          <Button
            onClick={handleGenerateAll}
            disabled={readyScenes.length === 0}
            className="gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" />
            Generate All
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
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
