"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, FileText, Loader2, Pencil, Play, Plus, RefreshCw, Sparkles, Trash2, Video, Wand2, X } from "lucide-react";
import type { SceneProductionState } from "./types";
import { PromptWithMentions, type ProductTag } from "./tab-3a";

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
      <div className="flex-1 h-1.5 bg-[#27272a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs tabular-nums text-[#a1a1aa] shrink-0 w-10 text-right">
        {value}/{max}
      </span>
    </div>
  );
}

// ─── Editable prompt ─────────────────────────────────────────────────────────

function EditablePrompt({
  scene,
  updateScene,
  productTags,
}: {
  scene: SceneProductionState;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  productTags: ProductTag[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.klingPrompt);

  // Sync draft when scene prop changes (e.g. edited from 3A tab)
  useEffect(() => {
    if (!editing) setDraft(scene.klingPrompt);
  }, [scene.klingPrompt, editing]);

  function handleSave() {
    updateScene(scene.sceneId, {
      klingPrompt: draft,
      klingPromptApproved: false,
    });
    setEditing(false);
  }

  const wc = scene.klingPrompt.trim().split(/\s+/).length;

  return (
    <div className="flex-1 min-w-0">
      <div
        className={cn(
          "rounded-lg border px-3.5 py-3 min-h-[72px] flex flex-col justify-between",
          scene.klingPromptApproved
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-[#1a1a1e] bg-[#09090b]"
        )}
      >
        {editing ? (
          <div className="space-y-2">
            <PromptWithMentions
              value={draft}
              onChange={setDraft}
              products={productTags}
              placeholder="Kling prompt with @product mentions..."
              rows={4}
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#71717a]">
                {draft.trim().split(/\s+/).length}w &middot; {"\u2318"}+Enter to save
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setDraft(scene.klingPrompt);
                    setEditing(false);
                  }}
                  className="text-[11px] text-[#71717a] hover:text-[#a1a1aa] px-2 py-0.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="text-[11px] font-medium text-white bg-[#6366f1] hover:bg-[#6366f1]/80 px-2.5 py-0.5 rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : scene.klingPrompt ? (
          <>
            <p className="text-sm text-[#a1a1aa] leading-relaxed">
              {scene.klingPrompt}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#71717a]">{wc}w</span>
              <div className="flex items-center gap-2">
                {scene.klingPromptApproved && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <Check className="h-3 w-3" />
                    Approved
                  </span>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[#52525b]">
            <FileText className="h-4 w-4" />
            <span className="text-xs">No prompt yet</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── End frame carousel + scene pair row ─────────────────────────────────────

function EndFrameSlot({
  scene,
  allScenes,
  projectId,
  updateScene,
}: {
  scene: SceneProductionState;
  allScenes: SceneProductionState[];
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState(scene.endFramePrompt ?? "");
  const [generating, setGenerating] = useState(false);
  const [extraVersions, setExtraVersions] = useState<Array<{ url: string; prompt: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Optimistic local override — allows instant UI updates before parent re-renders
  const [localPicked, setLocalPicked] = useState<string | null | undefined>(undefined);
  // undefined = use scene prop, string = overridden, null = cleared
  const picked = localPicked !== undefined ? localPicked : (scene.endFrameUrl ?? null);

  // Sync local override back to undefined when parent prop catches up
  useEffect(() => {
    if (localPicked !== undefined && scene.endFrameUrl === localPicked) {
      setLocalPicked(undefined);
    }
    if (localPicked === null && !scene.endFrameUrl) {
      setLocalPicked(undefined);
    }
  }, [scene.endFrameUrl, localPicked]);

  useEffect(() => {
    if (showPrompt && inputRef.current) inputRef.current.focus();
  }, [showPrompt]);

  // Build options from all scenes + extra generations
  const allOptions: Array<{ url: string; prompt: string; label: string }> = [];
  for (const s of allScenes) {
    for (const v of s.seedVersions) {
      if (v.imageUrl && !v.isRejected) {
        allOptions.push({ url: v.imageUrl, prompt: v.prompt ?? "", label: `Sc ${String(s.sceneOrder).padStart(2, "0")}` });
      }
    }
  }
  for (const v of extraVersions) {
    allOptions.push({ url: v.url, prompt: v.prompt, label: "New" });
  }
  const seen = new Set<string>();
  const uniqueOptions = allOptions.filter((o) => { if (seen.has(o.url)) return false; seen.add(o.url); return true; });
  const optionsLen = uniqueOptions.length;

  const [carouselIdx, setCarouselIdx] = useState(0);
  const safeIdx = optionsLen > 0 ? Math.min(carouselIdx, optionsLen - 1) : 0;
  const current = uniqueOptions[safeIdx];

  function goPrev() { setCarouselIdx((i) => (i > 0 ? i - 1 : Math.max(0, optionsLen - 1))); }
  function goNext() { setCarouselIdx((i) => (i < optionsLen - 1 ? i + 1 : 0)); }

  function handleSelect() {
    if (!current) return;
    setLocalPicked(current.url);
    updateScene(scene.sceneId, { endFrameUrl: current.url, endFramePrompt: current.prompt });
  }

  function handleRemove() {
    setLocalPicked(null);
    setShowPrompt(false);
    setCarouselIdx(0);
    updateScene(scene.sceneId, { endFrameUrl: null, endFramePrompt: null });
  }

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    const approvedVersion = scene.seedVersions.find((v) => v.id === scene.approvedSeedVersionId);
    const baseUrl = approvedVersion?.imageUrl ?? scene.referenceFrameUrl;
    if (!baseUrl) { setGenerating(false); return; }
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId: scene.sceneId, prompt: prompt.trim(), baseImageUrl: baseUrl }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = (await res.json()) as { imageUrl?: string };
      if (!data.imageUrl) throw new Error("No imageUrl in response");
      setExtraVersions((prev) => [...prev, { url: data.imageUrl!, prompt: prompt.trim() }]);
      setCarouselIdx(optionsLen); // new item will be at the end
      setLocalPicked(data.imageUrl!);
      updateScene(scene.sceneId, { endFrameUrl: data.imageUrl!, endFramePrompt: prompt.trim() });
    } catch (err) {
      console.error("[end-frame]", err);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="shrink-0 w-24">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-[#71717a]">End Frame</p>
        {picked && (
          <button
            onClick={handleRemove}
            className="p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
            title="Clear end frame"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {picked ? (
        <div className="space-y-1.5">
          <div className="w-20 aspect-[9/16] rounded-lg border-2 border-amber-500 overflow-hidden relative mx-auto">
            <img src={picked} alt="Selected end frame" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-0.5 left-0.5">
              <div className="bg-amber-500 rounded-full p-0.5">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
          </div>
          <button
            onClick={handleRemove}
            className="w-full flex items-center justify-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded py-1 transition-colors"
          >
            <X className="h-3 w-3" />
            Remove
          </button>
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="w-full text-center text-[10px] text-[#71717a] hover:text-amber-600 transition-colors"
          >
            Change
          </button>
        </div>
      ) : optionsLen > 0 ? (
        <div className="space-y-1.5">
          <div className="relative">
            <div className="w-20 aspect-[9/16] rounded-lg border-2 border-[#27272a] overflow-hidden relative mx-auto">
              {current && (
                <img src={current.url} alt={`Option ${safeIdx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
              )}
            </div>
            {optionsLen > 1 && (
              <>
                <button onClick={goPrev} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 p-0.5 rounded-full bg-[#18181b] border border-[#27272a] shadow-sm hover:bg-[#27272a]">
                  <ChevronLeft className="h-3 w-3 text-[#a1a1aa]" />
                </button>
                <button onClick={goNext} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 p-0.5 rounded-full bg-[#18181b] border border-[#27272a] shadow-sm hover:bg-[#27272a]">
                  <ChevronRight className="h-3 w-3 text-[#a1a1aa]" />
                </button>
              </>
            )}
          </div>
          <p className="text-center text-[10px] text-[#71717a] tabular-nums">{safeIdx + 1} / {optionsLen}</p>
          {current?.label && <p className="text-center text-[10px] text-amber-500 truncate">{current.label}</p>}
          <button onClick={handleSelect} className="w-full text-center text-[10px] font-medium text-amber-600 hover:text-amber-700">
            Use as end frame
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPrompt(true)}
          className="w-20 aspect-[9/16] rounded-lg border border-dashed border-[#27272a] hover:border-amber-300 flex flex-col items-center justify-center gap-1 transition-colors group/add"
        >
          <Plus className="h-4 w-4 text-[#52525b] group-hover/add:text-amber-500" />
          <span className="text-[9px] text-[#52525b] group-hover/add:text-amber-500">Add</span>
        </button>
      )}

      {showPrompt && (
        <div className="mt-2 space-y-1.5">
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !generating) { e.preventDefault(); handleGenerate(); }
              if (e.key === "Escape") setShowPrompt(false);
            }}
            placeholder="Describe end frame..."
            className="w-full text-[11px] border border-amber-200 rounded px-2 py-1 bg-[#18181b] focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-[#52525b] text-[#fafafa]"
            disabled={generating}
          />
          <button onClick={handleGenerate} disabled={generating || !prompt.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium text-white bg-amber-600 hover:bg-amber-500 py-1 rounded disabled:opacity-40">
            {generating ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : <><Wand2 className="h-3 w-3" /> Generate</>}
          </button>
        </div>
      )}
    </div>
  );
}

function GenerateVideoButton({
  scene,
  projectId,
  updateScene,
}: {
  scene: SceneProductionState;
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const isReady = scene.seedImageApproved && scene.klingPrompt.trim();
  const isActive = scene.videoJobStatus === "queued" || scene.videoJobStatus === "processing";
  const isCompleted = scene.videoJobStatus === "completed";

  async function handleGenerate() {
    if (!isReady || isActive) return;
    setSubmitting(true);
    updateScene(scene.sceneId, { videoJobStatus: "queued", videoJobProgress: 0 });
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobType: "kling_generation",
          projectId,
          sceneId: scene.sceneId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error);
      }
    } catch (err) {
      console.error("[generate-video]", err);
      updateScene(scene.sceneId, { videoJobStatus: "failed", videoJobError: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  if (isActive) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-[10px] text-blue-500">
          {scene.videoJobStatus === "processing" ? `${scene.videoJobProgress}%` : "Queued"}
        </span>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <button
        onClick={handleGenerate}
        disabled={!isReady || submitting}
        className="w-full flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors disabled:opacity-40"
        title="Rerun with current prompt"
      >
        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3" /> Rerun</>}
      </button>
    );
  }

  return (
    <button
      onClick={handleGenerate}
      disabled={!isReady || submitting}
      className={cn(
        "w-full flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded transition-colors disabled:opacity-30",
        isReady
          ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
          : "bg-[#09090b] text-[#52525b]"
      )}
      title={isReady ? "Generate video" : "Approve seed + prompt first"}
    >
      {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Play className="h-3 w-3" /> Generate</>}
    </button>
  );
}

function ScenePairRow({
  scene,
  allScenes,
  projectId,
  updateScene,
  onEditSeed,
  productTags,
}: {
  scene: SceneProductionState;
  allScenes: SceneProductionState[];
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  onEditSeed: (sceneId: string) => void;
  productTags: ProductTag[];
}) {
  return (
    <div className="flex gap-5 py-5 border-b border-[#1a1a1e] last:border-0">
      {/* Scene label */}
      <div className="w-10 shrink-0 pt-1 text-center">
        <div
          className="w-2.5 h-2.5 rounded-full mx-auto mb-1"
          style={{ backgroundColor: scene.color }}
        />
        <span className="text-xs tabular-nums font-medium text-[#71717a]">
          {String(scene.sceneOrder).padStart(2, "0")}
        </span>
        <p className="text-[10px] text-[#52525b] tabular-nums mt-0.5">
          {scene.targetClipDurationS.toFixed(1)}s
        </p>
      </div>

      {/* Seed image (start frame) */}
      <div className="shrink-0">
        <p className="text-[10px] text-[#71717a] mb-1">Start Frame</p>
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
                  ? "border-emerald-500/20"
                  : "border-[#1a1a1e] border-dashed"
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
                <ImageOff className="h-4 w-4 text-[#27272a]" />
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
          onClick={() => onEditSeed(scene.sceneId)}
          className="mt-1.5 flex items-center gap-1 text-[11px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          Edit seed
        </button>
      </div>

      {/* End frame (optional) */}
      <EndFrameSlot
        scene={scene}
        allScenes={allScenes}
        projectId={projectId}
        updateScene={updateScene}
      />

      {/* Kling prompt — editable inline */}
      <EditablePrompt scene={scene} updateScene={updateScene} productTags={productTags} />

      {/* Actions column: approvals + generate + download */}
      <div className="shrink-0 flex flex-col items-center gap-2 w-24 pt-1">
        {/* Approval toggles */}
        <div className="flex flex-col gap-1 w-full">
          <button
            onClick={() => updateScene(scene.sceneId, { seedImageApproved: !scene.seedImageApproved })}
            className={cn(
              "w-full text-[10px] font-medium px-2 py-1 rounded transition-colors",
              scene.seedImageApproved
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[#27272a] text-[#a1a1aa] hover:bg-emerald-500/10"
            )}
          >
            {scene.seedImageApproved ? "Seed ✓" : "Approve Seed"}
          </button>
          <button
            onClick={() => {
              const next = !scene.klingPromptApproved;
              updateScene(scene.sceneId, { klingPromptApproved: next });
              fetch(`/api/projects/${projectId}/scenes/${scene.sceneId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ klingPromptApproved: next }),
              }).catch(console.error);
            }}
            className={cn(
              "w-full text-[10px] font-medium px-2 py-1 rounded transition-colors",
              scene.klingPromptApproved
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-[#27272a] text-[#a1a1aa] hover:bg-emerald-500/10"
            )}
          >
            {scene.klingPromptApproved ? "Prompt ✓" : "Approve Prompt"}
          </button>
        </div>

        {/* Generate / Rerun */}
        <GenerateVideoButton scene={scene} projectId={projectId} updateScene={updateScene} />

        {/* Download latest video */}
        {scene.videoVersions.length > 0 && (() => {
          const latest = [...scene.videoVersions].filter((v) => !v.isRejected)[0];
          if (!latest?.fileUrl) return null;
          return (
            <button
              onClick={() => {
                fetch(latest.fileUrl).then((r) => r.blob()).then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `scene${String(scene.sceneOrder).padStart(2, "0")}-video.mp4`;
                  a.click();
                  URL.revokeObjectURL(url);
                });
              }}
              className="flex items-center gap-1 text-[10px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
              title="Download latest video"
            >
              <Download className="h-3 w-3" />
              Video
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ─── TabReview ────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  projectId: string;
  onGoToSeed: (sceneId?: string) => void;
  onGoToScript: () => void;
  productTags: ProductTag[];
};

export function TabReview({ scenes, updateScene, projectId, onGoToSeed, onGoToScript, productTags }: Props) {
  const [reoptimizing, setReoptimizing] = useState(false);
  const [bulkInstruction, setBulkInstruction] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set(scenes.map((s) => s.sceneId)));
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function handleReoptimize() {
    const withPrompts = scenes.filter((s) => s.klingPrompt.trim());
    if (withPrompts.length === 0) {
      setFeedback({ type: "error", msg: "No scenes have prompts to optimize" });
      return;
    }
    setReoptimizing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/bulk-edit-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: "Re-optimize these Kling prompts. Keep the same scene structure, subject, actions, and dialogue. Improve clarity, remove redundancy, tighten motion descriptions, and follow Kling prompting best practices. Do NOT change what happens in each scene — only improve HOW it's described. REMOVE all background/environment/setting descriptions (white studio, minimal backdrop, etc.) — backgrounds come from the seed image. Focus prompts on: subject actions, body movement, camera movement, pacing, and dialogue.",
          prompts: withPrompts.map((s) => ({
            sceneId: s.sceneId,
            sceneOrder: s.sceneOrder,
            prompt: s.klingPrompt,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { results } = (await res.json()) as { results: Array<{ sceneId: string; prompt: string }> };
      for (const r of results) {
        updateScene(r.sceneId, { klingPrompt: r.prompt, klingPromptApproved: false });
        fetch(`/api/projects/${projectId}/scenes/${r.sceneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptSegment: r.prompt, klingPromptApproved: false }),
        }).catch(console.error);
      }
      setFeedback({ type: "success", msg: `Re-optimized ${results.length} prompt${results.length !== 1 ? "s" : ""}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[reoptimize]", msg);
      setFeedback({ type: "error", msg: `Re-optimize failed: ${msg}` });
    } finally {
      setReoptimizing(false);
    }
  }

  async function handleBulkEdit() {
    if (!bulkInstruction.trim()) {
      setFeedback({ type: "error", msg: "Enter an instruction first" });
      return;
    }
    if (bulkSelected.size === 0) {
      setFeedback({ type: "error", msg: "Select at least one scene" });
      return;
    }
    const selected = scenes.filter((s) => bulkSelected.has(s.sceneId));
    const withPrompts = selected.filter((s) => s.klingPrompt.trim());
    if (withPrompts.length === 0) {
      setFeedback({ type: "error", msg: "Selected scenes have no prompts to edit" });
      return;
    }
    setFeedback({ type: "success", msg: `Applying to ${withPrompts.length} prompt(s)...` });
    setBulkApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bulk-edit-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: bulkInstruction,
          prompts: withPrompts.map((s) => ({
            sceneId: s.sceneId,
            sceneOrder: s.sceneOrder,
            prompt: s.klingPrompt,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const { results } = (await res.json()) as { results: Array<{ sceneId: string; prompt: string }> };
      // Update UI + save each prompt directly to DB (don't rely on debounce)
      for (const r of results) {
        updateScene(r.sceneId, { klingPrompt: r.prompt, klingPromptApproved: false });
        fetch(`/api/projects/${projectId}/scenes/${r.sceneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scriptSegment: r.prompt, klingPromptApproved: false }),
        }).catch(console.error);
      }
      setBulkInstruction("");
      setFeedback({ type: "success", msg: `Updated ${results.length} prompt${results.length !== 1 ? "s" : ""}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[bulk-edit]", msg);
      setFeedback({ type: "error", msg: `Bulk edit failed: ${msg}` });
    } finally {
      setBulkApplying(false);
    }
  }

  const seedsApproved = scenes.filter((s) => s.seedImageApproved || s.seedSkipped).length;
  const promptsApproved = scenes.filter((s) => s.klingPromptApproved).length;
  const bothApproved = scenes.filter(
    (s) => (s.seedImageApproved || s.seedSkipped) && s.klingPromptApproved
  ).length;

  const ready = bothApproved === scenes.length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-6">
        {/* Progress summary */}
        <div className="mb-7 p-5 rounded-xl border border-[#1a1a1e] bg-[#09090b]/50 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-[#a1a1aa]">
              Production readiness
            </p>
            <div className="flex items-center gap-2">
              {ready && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  <Check className="h-3.5 w-3.5" />
                  Ready
                </span>
              )}
              {(() => {
                const readyScenes = scenes.filter((s) => (s.seedImageApproved || s.seedSkipped) && s.klingPrompt.trim() && s.videoJobStatus !== "queued" && s.videoJobStatus !== "processing");
                if (readyScenes.length === 0) return null;
                return (
                  <button
                    onClick={async () => {
                      for (const s of readyScenes) {
                        updateScene(s.sceneId, { videoJobStatus: "queued", videoJobProgress: 0 });
                        fetch("/api/jobs", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ jobType: "kling_generation", projectId, sceneId: s.sceneId }),
                        }).catch(console.error);
                      }
                      setFeedback({ type: "success", msg: `Queued ${readyScenes.length} video generation(s)` });
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 px-2.5 py-1 rounded-full transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Generate All ({readyScenes.length})
                  </button>
                );
              })()}
            </div>
          </div>
          <div className="space-y-2.5">
            <div>
              <p className="text-xs text-[#a1a1aa] mb-1.5">Seed images</p>
              <ProgressBar value={seedsApproved} max={scenes.length} color="#10b981" />
            </div>
            <div>
              <p className="text-xs text-[#a1a1aa] mb-1.5">Kling prompts</p>
              <ProgressBar value={promptsApproved} max={scenes.length} color="#6366f1" />
            </div>
            <div>
              <p className="text-xs text-[#a1a1aa] mb-1.5">Pairs complete</p>
              <ProgressBar value={bothApproved} max={scenes.length} color="#f59e0b" />
            </div>
          </div>
        </div>

        {/* Prompt optimizer */}
        <div className="mb-7 rounded-xl border border-violet-100 bg-violet-50/30 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-widest text-violet-400">
              Prompt Optimizer
            </p>
            <button
              onClick={() => {
                setBulkSelected((prev) =>
                  prev.size === scenes.length ? new Set() : new Set(scenes.map((s) => s.sceneId))
                );
              }}
              className="text-[10px] text-violet-400 hover:text-violet-600 transition-colors"
            >
              {bulkSelected.size === scenes.length ? "Deselect all" : "Select all"}
            </button>
          </div>

          {/* Scene selection pills */}
          <div className="flex flex-wrap gap-1.5">
            {scenes.map((s) => (
              <button
                key={s.sceneId}
                onClick={() => {
                  setBulkSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.sceneId)) next.delete(s.sceneId);
                    else next.add(s.sceneId);
                    return next;
                  });
                }}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                  bulkSelected.has(s.sceneId)
                    ? "bg-violet-600 text-white"
                    : "bg-[#18181b] border border-violet-200 text-[#71717a] hover:border-violet-300"
                )}
              >
                Scene {String(s.sceneOrder).padStart(2, "0")}
              </button>
            ))}
          </div>

          {/* Bulk edit instruction */}
          <div className="flex gap-2">
            <input
              value={bulkInstruction}
              onChange={(e) => setBulkInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !bulkApplying) {
                  e.preventDefault();
                  handleBulkEdit();
                }
              }}
              placeholder="e.g. remove background descriptions, shorten to under 35 words..."
              className="flex-1 text-sm border border-violet-200 rounded-md px-3 py-1.5 h-9 bg-[#18181b] focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all placeholder:text-[#52525b] text-[#fafafa]"
            />
            <button
              onClick={handleBulkEdit}
              disabled={bulkApplying || !bulkInstruction.trim() || bulkSelected.size === 0}
              className="gap-2 h-9 text-sm border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-40 shrink-0 inline-flex items-center px-3 rounded-md font-medium transition-colors"
            >
              {bulkApplying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Apply ({bulkSelected.size})
                </>
              )}
            </button>
          </div>

          {/* Re-optimize all */}
          {scenes.some((s) => s.klingPrompt.trim()) && (
            <button
              onClick={handleReoptimize}
              disabled={reoptimizing || bulkApplying}
              className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
            >
              {reoptimizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Re-optimizing all prompts…
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Re-optimize all prompts
                </>
              )}
            </button>
          )}

          {/* Feedback */}
          {feedback && (
            <p
              className={cn(
                "text-xs font-medium",
                feedback.type === "success" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {feedback.msg}
            </p>
          )}
        </div>

        {/* Scene pairs */}
        <div>
          {scenes.map((scene) => (
            <ScenePairRow
              key={scene.sceneId}
              scene={scene}
              allScenes={scenes}
              projectId={projectId}
              updateScene={updateScene}
              onEditSeed={(sceneId: string) => onGoToSeed(sceneId)}
              productTags={productTags}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
