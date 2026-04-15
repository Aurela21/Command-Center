"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, ExternalLink, ImageOff, FileText, Loader2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wand2, X } from "lucide-react";
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
            ? "border-emerald-200 bg-emerald-50/30"
            : "border-neutral-100 bg-neutral-50"
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
              <span className="text-[10px] text-neutral-400">
                {draft.trim().split(/\s+/).length}w &middot; {"\u2318"}+Enter to save
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    setDraft(scene.klingPrompt);
                    setEditing(false);
                  }}
                  className="text-[11px] text-neutral-400 hover:text-neutral-600 px-2 py-0.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-700 px-2.5 py-0.5 rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : scene.klingPrompt ? (
          <>
            <p className="text-sm text-neutral-600 leading-relaxed">
              {scene.klingPrompt}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-neutral-400">{wc}w</span>
              <div className="flex items-center gap-2">
                {scene.klingPromptApproved && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <Check className="h-3 w-3" />
                    Approved
                  </span>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-neutral-300">
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
        <p className="text-[10px] text-neutral-400">End Frame</p>
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
            className="w-full text-center text-[10px] text-neutral-400 hover:text-amber-600 transition-colors"
          >
            Change
          </button>
        </div>
      ) : optionsLen > 0 ? (
        <div className="space-y-1.5">
          <div className="relative">
            <div className="w-20 aspect-[9/16] rounded-lg border-2 border-neutral-200 overflow-hidden relative mx-auto">
              {current && (
                <img src={current.url} alt={`Option ${safeIdx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
              )}
            </div>
            {optionsLen > 1 && (
              <>
                <button onClick={goPrev} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 p-0.5 rounded-full bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50">
                  <ChevronLeft className="h-3 w-3 text-neutral-500" />
                </button>
                <button onClick={goNext} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 p-0.5 rounded-full bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50">
                  <ChevronRight className="h-3 w-3 text-neutral-500" />
                </button>
              </>
            )}
          </div>
          <p className="text-center text-[10px] text-neutral-400 tabular-nums">{safeIdx + 1} / {optionsLen}</p>
          {current?.label && <p className="text-center text-[10px] text-amber-500 truncate">{current.label}</p>}
          <button onClick={handleSelect} className="w-full text-center text-[10px] font-medium text-amber-600 hover:text-amber-700">
            Use as end frame
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPrompt(true)}
          className="w-20 aspect-[9/16] rounded-lg border border-dashed border-neutral-200 hover:border-amber-300 flex flex-col items-center justify-center gap-1 transition-colors group/add"
        >
          <Plus className="h-4 w-4 text-neutral-300 group-hover/add:text-amber-500" />
          <span className="text-[9px] text-neutral-300 group-hover/add:text-amber-500">Add</span>
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
            className="w-full text-[11px] border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all placeholder:text-neutral-300"
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
  onEditSeed: () => void;
  productTags: ProductTag[];
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

      {/* Seed image (start frame) */}
      <div className="shrink-0">
        <p className="text-[10px] text-neutral-400 mb-1">Start Frame</p>
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

      {/* End frame (optional) */}
      <EndFrameSlot
        scene={scene}
        allScenes={allScenes}
        projectId={projectId}
        updateScene={updateScene}
      />

      {/* Kling prompt — editable inline */}
      <EditablePrompt scene={scene} updateScene={updateScene} productTags={productTags} />
    </div>
  );
}

// ─── TabReview ────────────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  projectId: string;
  onGoTo3A: () => void;
  onGoTo3B: () => void;
};

export function TabReview({ scenes, updateScene, projectId, onGoTo3A, onGoTo3B }: Props) {
  const [reoptimizing, setReoptimizing] = useState(false);
  const [bulkInstruction, setBulkInstruction] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set(scenes.map((s) => s.sceneId)));
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Fetch product tags for @mentions
  const [productTags, setProductTags] = useState<ProductTag[]>([]);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ slug: string; name: string; imageCount?: number }>) =>
        setProductTags(data.map((p) => ({ slug: p.slug, name: p.name, imageCount: p.imageCount ?? 0 })))
      )
      .catch(() => {});
  }, []);

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
                    : "bg-white border border-violet-200 text-neutral-400 hover:border-violet-300"
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
              className="flex-1 text-sm border border-violet-200 rounded-md px-3 py-1.5 h-9 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-300 transition-all placeholder:text-neutral-300"
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
              onEditSeed={onGoTo3A}
              productTags={productTags}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
