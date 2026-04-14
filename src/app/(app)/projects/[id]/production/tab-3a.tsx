"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Package, ShoppingBag, Sparkles, Trash2, Wand2 } from "lucide-react";
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
          {scene.seedGenerating && (
            <Loader2
              className={cn(
                "h-3 w-3 animate-spin",
                isSelected ? "text-white/60" : "text-neutral-400"
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

// ─── Prompt textarea with @mention autocomplete ─────────────────────────────

type ProductTag = { slug: string; name: string; imageCount: number };

function PromptWithMentions({
  value,
  onChange,
  products,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  products: ProductTag[];
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [menuFilter, setMenuFilter] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);

  // Find the @word being typed at the cursor
  const getAtWord = useCallback(
    (text: string, cursor: number) => {
      const before = text.slice(0, cursor);
      const match = before.match(/@([\w-]*)$/);
      return match ? { start: before.length - match[0].length, fragment: match[1] } : null;
    },
    []
  );

  const filtered = products.filter(
    (p) =>
      !menuFilter ||
      p.slug.includes(menuFilter.toLowerCase()) ||
      p.name.toLowerCase().includes(menuFilter.toLowerCase())
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newVal = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    onChange(newVal);
    setCursorPos(cursor);

    const atWord = getAtWord(newVal, cursor);
    if (atWord && products.length > 0) {
      setMenuFilter(atWord.fragment);
      setMenuIndex(0);
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  }

  function insertMention(slug: string) {
    const atWord = getAtWord(value, cursorPos);
    if (!atWord) return;
    const before = value.slice(0, atWord.start);
    const after = value.slice(cursorPos);
    const newVal = `${before}@${slug} ${after}`;
    onChange(newVal);
    setShowMenu(false);

    // Restore focus and cursor position
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        const newCursor = atWord.start + slug.length + 2; // @slug + space
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showMenu || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMenuIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMenuIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[menuIndex].slug);
    } else if (e.key === "Escape") {
      setShowMenu(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay to allow menu click
          setTimeout(() => setShowMenu(false), 200);
        }}
        rows={4}
        placeholder={placeholder}
        className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 transition-all placeholder:text-neutral-400"
      />

      {/* Autocomplete dropdown */}
      {showMenu && filtered.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {filtered.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(p.slug);
              }}
              className={cn(
                "w-full text-left flex items-center gap-3 px-3 py-2.5 transition-colors",
                i === menuIndex
                  ? "bg-orange-50"
                  : "hover:bg-neutral-50"
              )}
            >
              <div className="shrink-0 w-7 h-7 rounded bg-orange-100 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">
                  {p.name}
                </p>
                <p className="text-[11px] text-orange-500 font-mono">
                  @{p.slug}
                  <span className="text-neutral-300 ml-1.5">
                    {p.imageCount} image{p.imageCount !== 1 ? "s" : ""}
                  </span>
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Seed detail panel (right panel) ─────────────────────────────────────────

function SeedDetailPanel({
  scene,
  projectId,
  updateScene,
}: {
  scene: SceneProductionState;
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
}) {
  const generating = scene.seedGenerating ?? false;
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  // Fetch available @tags from product profiles
  const [productTags, setProductTags] = useState<Array<{ slug: string; name: string; imageCount: number }>>([]);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((products: Array<{ slug: string; name: string; imageCount: number }>) => {
        setProductTags(products.filter((p) => (p.imageCount ?? 0) > 0));
      })
      .catch(() => {});
  }, []);

  // Clear refined prompt when user edits the brief prompt
  useEffect(() => {
    setRefinedPrompt(null);
  }, [scene.nanoBananaPrompt]);

  async function handleEnhance() {
    if (!scene.nanoBananaPrompt.trim()) return;
    setRefining(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/refine-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.nanoBananaPrompt,
          target: "seed_image",
          sceneId: scene.sceneId,
        }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      const { refined } = (await res.json()) as { refined: string };
      setRefinedPrompt(refined);
    } catch (err) {
      console.error("[enhance]", err);
    } finally {
      setRefining(false);
    }
  }

  async function handleGenerate() {
    const finalPrompt = refinedPrompt ?? scene.nanoBananaPrompt;
    if (!finalPrompt.trim()) return;
    updateScene(scene.sceneId, { seedGenerating: true });
    try {
      const res = await fetch(
        `/api/projects/${projectId}/generate-seed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: scene.sceneId,
            prompt: finalPrompt,
          }),
        }
      );
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({
          error: "Request failed",
        }))) as { error: string };
        throw new Error(error);
      }
    } catch (err) {
      console.error("[generate-seed]", err);
      updateScene(scene.sceneId, { seedGenerating: false });
    }
  }

  async function handleApproveSeed(versionId: string) {
    updateScene(scene.sceneId, {
      approvedSeedVersionId: versionId,
      seedImageApproved: true,
    });
    await fetch(`/api/projects/${projectId}/scenes/${scene.sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvedSeedImageId: versionId,
        seedImageApproved: true,
      }),
    }).catch(console.error);
  }

  const [rejecting, setRejecting] = useState<string | null>(null);

  async function handleReject(versionId: string) {
    setRejecting(versionId);
    try {
      const res = await fetch(`/api/projects/${projectId}/reject-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetVersionId: versionId }),
      });
      if (!res.ok) throw new Error("Reject failed");
      const { rejectionReason } = (await res.json()) as { rejectionReason: string };
      // Update local state to mark as rejected
      updateScene(scene.sceneId, {
        seedVersions: scene.seedVersions.map((v) =>
          v.id === versionId ? { ...v, isRejected: true, rejectionReason } : v
        ),
        // If the rejected version was approved, unapprove
        ...(scene.approvedSeedVersionId === versionId
          ? { approvedSeedVersionId: null, seedImageApproved: false }
          : {}),
      });
    } catch (err) {
      console.error("[reject]", err);
    } finally {
      setRejecting(null);
    }
  }

  async function handleUnapprove() {
    updateScene(scene.sceneId, {
      approvedSeedVersionId: null,
      seedImageApproved: false,
    });
    await fetch(`/api/projects/${projectId}/scenes/${scene.sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvedSeedImageId: null,
        seedImageApproved: false,
      }),
    }).catch(console.error);
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
        {scene.referenceFrameUrl ? (
          <img
            src={scene.referenceFrameUrl}
            alt={`Scene ${scene.sceneOrder} reference frame`}
            className="w-32 aspect-[9/16] rounded-lg border border-neutral-100 object-cover"
          />
        ) : (
          <div
            className="w-32 aspect-[9/16] rounded-lg border border-neutral-100 flex items-end justify-end p-2"
            style={{ backgroundColor: scene.color }}
          >
            <span className="text-[10px] font-mono font-semibold text-neutral-600 bg-white/80 px-1.5 py-0.5 rounded leading-none">
              f{scene.referenceFrame}
            </span>
          </div>
        )}
      </div>

      {/* Brief prompt with @mention autocomplete */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Seed Image Prompt
        </p>
        <PromptWithMentions
          value={scene.nanoBananaPrompt}
          onChange={(val) => updateScene(scene.sceneId, { nanoBananaPrompt: val })}
          products={productTags}
          placeholder="Describe the seed image… Type @ to reference a product"
        />
        <div className="mt-2.5 flex items-center gap-2">
          <Button
            onClick={handleEnhance}
            disabled={refining || !scene.nanoBananaPrompt.trim() || generating}
            variant="outline"
            className="gap-2 h-9 text-sm disabled:opacity-40"
          >
            {refining ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Enhancing…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Enhance Prompt
              </>
            )}
          </Button>
          {refinedPrompt === null && (
            <Button
              onClick={handleGenerate}
              disabled={generating || !scene.nanoBananaPrompt.trim()}
              className="gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm disabled:opacity-40"
            >
              {generating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  Generate (skip enhance)
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Refined prompt (shown after enhancement) */}
      {refinedPrompt !== null && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
              Enhanced Prompt
            </p>
            <button
              onClick={() => setRefinedPrompt(null)}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Discard
            </button>
          </div>
          <textarea
            value={refinedPrompt}
            onChange={(e) => setRefinedPrompt(e.target.value)}
            rows={5}
            className="w-full text-sm rounded-md border border-blue-200 bg-blue-50/30 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all text-neutral-700 leading-relaxed"
          />
          <Button
            onClick={handleGenerate}
            disabled={generating}
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
                Generate with Enhanced Prompt
              </>
            )}
          </Button>
        </div>
      )}

      {/* Generated versions */}
      {scene.seedVersions.length > 0 ? (
        <div>
          {(() => {
            const active = scene.seedVersions.filter((v) => !v.isRejected);
            const rejected = scene.seedVersions.filter((v) => v.isRejected);
            return (
              <>
                <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
                  Generated Versions
                  {rejected.length > 0 && (
                    <span className="text-neutral-300 font-normal ml-1">
                      ({rejected.length} rejected)
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {active.map((v: SeedVersion, i: number) => {
                    const isApproved = v.id === scene.approvedSeedVersionId;
                    const isRejecting = rejecting === v.id;
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "rounded-lg border-2 overflow-hidden transition-all group/card",
                          isApproved
                            ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-1"
                            : "border-neutral-100 hover:border-neutral-300"
                        )}
                      >
                        <div
                          className="aspect-[9/16] relative overflow-hidden"
                          style={{
                            backgroundColor: v.imageUrl ? undefined : scene.color,
                          }}
                        >
                          {v.imageUrl ? (
                            <img
                              src={v.imageUrl}
                              alt={`Seed v${i + 1}`}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          ) : null}
                          {isApproved && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="bg-white rounded-full p-1">
                                <Check className="h-3.5 w-3.5 text-neutral-900" />
                              </div>
                            </div>
                          )}
                          {/* Trash button */}
                          {!isApproved && (
                            <button
                              onClick={() => handleReject(v.id)}
                              disabled={isRejecting}
                              className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-500/80 disabled:opacity-50"
                              title="Reject — Claude will analyze why it's bad"
                            >
                              {isRejecting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                        <div className="px-2.5 py-2 bg-white flex items-center justify-between">
                          <span
                            className={cn(
                              "text-xs font-semibold tabular-nums",
                              v.qualityScore >= 80
                                ? "text-emerald-600"
                                : v.qualityScore >= 65
                                ? "text-amber-600"
                                : "text-neutral-400"
                            )}
                          >
                            {v.qualityScore > 0 ? v.qualityScore : `v${i + 1}`}
                          </span>
                          <button
                            onClick={() =>
                              isApproved
                                ? handleUnapprove()
                                : handleApproveSeed(v.id)
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

                {/* Rejected versions (collapsed) */}
                {rejected.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600 transition-colors">
                      {rejected.length} rejected version{rejected.length !== 1 ? "s" : ""} — click to view
                    </summary>
                    <div className="mt-2 space-y-2">
                      {rejected.map((v, i) => (
                        <div key={v.id} className="flex gap-3 p-2 rounded-lg bg-red-50/50 border border-red-100">
                          {v.imageUrl && (
                            <img
                              src={v.imageUrl}
                              alt={`Rejected v${i + 1}`}
                              className="w-12 h-12 rounded object-cover shrink-0 opacity-60"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-red-600">Rejected</p>
                            {v.rejectionReason && (
                              <p className="text-[11px] text-neutral-500 leading-relaxed mt-0.5 whitespace-pre-line">
                                {v.rejectionReason}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            );
          })()}
        </div>
      ) : generating ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-neutral-200 rounded-xl">
          <Loader2 className="h-8 w-8 text-neutral-300 mb-3 animate-spin" />
          <p className="text-sm text-neutral-400">Generating seed image…</p>
          <p className="text-xs text-neutral-400 mt-1">
            This takes about 30–60 seconds
          </p>
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
  projectId: string;
};

export function Tab3A({ scenes, updateScene, projectId }: Props) {
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
            projectId={projectId}
            updateScene={updateScene}
          />
        )}
      </div>
    </div>
  );
}
