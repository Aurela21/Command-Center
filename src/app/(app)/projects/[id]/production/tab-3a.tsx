"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronRight, Copy, Loader2, Package, Pencil, Plus, Sparkles, Trash2, User, Wand2, X } from "lucide-react";
import type { SceneProductionState, SeedVersion, HeroImage } from "./types";

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

export type ProductTag = { slug: string; name: string; imageCount: number };

export function PromptWithMentions({
  value,
  onChange,
  products,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (val: string) => void;
  products: ProductTag[];
  placeholder?: string;
  rows?: number;
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
        rows={rows}
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

// ─── Seed card footer with expandable prompt ────────────────────────────────

function SeedCardFooter({
  version,
  index,
  isApproved,
  projectId,
  currentSceneId,
  allScenes,
  productTags,
  onApprove,
  onUnapprove,
  onPromptSaved,
  onApplyToScenes,
  onEditVersion,
}: {
  version: SeedVersion;
  index: number;
  isApproved: boolean;
  projectId: string;
  currentSceneId: string;
  allScenes: SceneProductionState[];
  productTags: ProductTag[];
  onApprove: () => void;
  onUnapprove: () => void;
  onPromptSaved: (newPrompt: string) => void;
  onApplyToScenes: (versionId: string, targetSceneIds: string[]) => Promise<void>;
  onEditVersion: (imageUrl: string, editPrompt: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.prompt ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showApplyPanel, setShowApplyPanel] = useState(false);
  const [applyTargets, setApplyTargets] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [showEditField, setShowEditField] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  // Sync draft when version.prompt changes externally
  useEffect(() => {
    if (!editing) setDraft(version.prompt ?? "");
  }, [version.prompt, editing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [editing]);

  async function handleSave() {
    if (draft === (version.prompt ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/asset-versions/${version.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationPrompt: draft }),
        }
      );
      if (res.ok) {
        onPromptSaved(draft);
        setEditing(false);
      }
    } catch (err) {
      console.error("[seed-prompt-save]", err);
    } finally {
      setSaving(false);
    }
  }

  const promptText = version.prompt;

  return (
    <div className="bg-white">
      {/* Score + Approve + Edit row */}
      <div className="px-2.5 py-2 flex items-center justify-between gap-1.5">
        <span
          className={cn(
            "text-xs font-semibold tabular-nums shrink-0",
            version.qualityScore >= 80
              ? "text-emerald-600"
              : version.qualityScore >= 65
              ? "text-amber-600"
              : "text-neutral-400"
          )}
        >
          {version.qualityScore > 0 ? version.qualityScore : `v${index + 1}`}
        </span>
        <div className="flex items-center gap-1.5">
          {version.imageUrl && (
            <button
              onClick={() => {
                setShowEditField(!showEditField);
                if (!showEditField) {
                  setTimeout(() => editRef.current?.focus(), 50);
                }
              }}
              className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors bg-neutral-100 text-neutral-500 hover:bg-amber-100 hover:text-amber-700"
              title="Edit this image"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => (isApproved ? onUnapprove() : onApprove())}
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

      {/* Edit image field */}
      {showEditField && version.imageUrl && (
        <div className="border-t border-neutral-100 px-2.5 py-2 space-y-1.5">
          <p className="text-[10px] font-medium text-amber-600">
            Describe what to change
          </p>
          <div className="space-y-1.5">
            <PromptWithMentions
              value={editInstruction}
              onChange={setEditInstruction}
              products={productTags}
              placeholder="e.g. make the hoodie red, add @airpplane-hoodie details..."
              rows={2}
            />
            <button
              onClick={() => {
                if (!editInstruction.trim() || editSubmitting) return;
                setEditSubmitting(true);
                onEditVersion(version.imageUrl!, editInstruction.trim())
                  .then(() => {
                    setEditInstruction("");
                    setShowEditField(false);
                  })
                  .finally(() => setEditSubmitting(false));
              }}
              disabled={editSubmitting || !editInstruction.trim()}
              className="text-[11px] font-medium text-white bg-amber-600 hover:bg-amber-500 px-2.5 py-1 rounded transition-colors disabled:opacity-40 shrink-0"
            >
              {editSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Edit"}
            </button>
          </div>
        </div>
      )}

      {/* Apply to Scenes — only on approved seeds */}
      {isApproved && allScenes.length > 1 && (
        <div className="border-t border-neutral-100">
          <button
            onClick={() => {
              setShowApplyPanel(!showApplyPanel);
              if (!showApplyPanel) {
                // Pre-select no scenes
                setApplyTargets(new Set());
              }
            }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-neutral-50 transition-colors"
          >
            <Copy className="h-3 w-3 text-neutral-400 shrink-0" />
            <span className="text-[11px] text-neutral-500">Apply to other scenes</span>
          </button>

          {showApplyPanel && (
            <div className="px-2.5 pb-2.5 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {allScenes
                  .filter((s) => s.sceneId !== currentSceneId)
                  .map((s) => (
                    <button
                      key={s.sceneId}
                      onClick={() => {
                        setApplyTargets((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.sceneId)) next.delete(s.sceneId);
                          else next.add(s.sceneId);
                          return next;
                        });
                      }}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                        applyTargets.has(s.sceneId)
                          ? "bg-neutral-900 text-white"
                          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                      )}
                    >
                      Scene {String(s.sceneOrder).padStart(2, "0")}
                    </button>
                  ))}
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    const otherIds = allScenes
                      .filter((s) => s.sceneId !== currentSceneId)
                      .map((s) => s.sceneId);
                    setApplyTargets((prev) =>
                      prev.size === otherIds.length ? new Set() : new Set(otherIds)
                    );
                  }}
                  className="text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  {applyTargets.size === allScenes.length - 1 ? "Deselect all" : "Select all"}
                </button>
                <button
                  onClick={async () => {
                    if (applyTargets.size === 0) return;
                    setApplying(true);
                    await onApplyToScenes(version.id, [...applyTargets]);
                    setApplying(false);
                    setShowApplyPanel(false);
                    setApplyTargets(new Set());
                  }}
                  disabled={applying || applyTargets.size === 0}
                  className="text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-700 px-2.5 py-1 rounded transition-colors disabled:opacity-40"
                >
                  {applying ? "Applying…" : `Apply to ${applyTargets.size} scene${applyTargets.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable prompt section */}
      {promptText ? (
        <div className="border-t border-neutral-100">
          <button
            onClick={() => { setExpanded(!expanded); setEditing(false); }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-neutral-50 transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 text-neutral-400 transition-transform shrink-0",
                expanded && "rotate-180"
              )}
            />
            <span className="text-[11px] text-neutral-500 truncate flex-1">
              {promptText}
            </span>
          </button>

          {expanded && (
            <div className="px-2.5 pb-2.5 space-y-2">
              {editing ? (
                <>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    className="w-full text-[11px] rounded border border-neutral-200 px-2 py-1.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all leading-relaxed"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSave();
                      }
                      if (e.key === "Escape") {
                        setDraft(version.prompt ?? "");
                        setEditing(false);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">
                      {"\u2318"}+Enter to save &middot; Esc to cancel
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setDraft(version.prompt ?? "");
                          setEditing(false);
                        }}
                        className="text-[11px] text-neutral-400 hover:text-neutral-600 px-1.5 py-0.5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-[11px] font-medium text-white bg-neutral-900 hover:bg-neutral-700 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-neutral-600 leading-relaxed whitespace-pre-wrap">
                    {promptText}
                  </p>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit prompt
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="border-t border-neutral-100 px-2.5 py-1.5">
          <span className="text-[11px] text-neutral-300 italic">No prompt recorded</span>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible reference frame picker ──────────────────────────────────────

function ReferenceFramePicker({
  scene,
  projectId,
  updateScene,
  extractedFrameCount,
  r2PublicUrl,
}: {
  scene: SceneProductionState;
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  extractedFrameCount: number;
  r2PublicUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const frames = allFrameUrls(r2PublicUrl, projectId, extractedFrameCount);
  const selectedUrl = scene.referenceFrameUrl ?? frames[scene.referenceFrame] ?? frames[0];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
          Reference Frame
          <span className="text-neutral-300 font-normal ml-2 normal-case tracking-normal">
            {extractedFrameCount} available
          </span>
        </p>
        <button
          onClick={() => setOpen(!open)}
          className="text-[11px] text-neutral-500 hover:text-neutral-700 transition-colors flex items-center gap-1"
        >
          {open ? "Collapse" : "Change frame"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Collapsed: show selected frame thumbnail */}
      {!open && selectedUrl && (
        <div className="flex items-center gap-3">
          <img
            src={selectedUrl}
            alt={`Frame ${scene.referenceFrame}`}
            className="w-14 h-24 rounded-lg object-cover border-2 border-neutral-900"
          />
          <span className="text-xs text-neutral-500">Frame {scene.referenceFrame}</span>
        </div>
      )}

      {/* Expanded: frame grid */}
      {open && (
        <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 p-2 bg-neutral-50/50">
          {frames.map((url, i) => {
            const isSelected = scene.referenceFrameUrl === url || (!scene.referenceFrameUrl && i === scene.referenceFrame);
            return (
              <button
                key={i}
                onClick={() => {
                  updateScene(scene.sceneId, {
                    referenceFrame: i,
                    referenceFrameUrl: url,
                  });
                  fetch(`/api/projects/${projectId}/scenes/${scene.sceneId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      referenceFrame: i,
                      referenceFrameUrl: url,
                    }),
                  }).catch(console.error);
                  setOpen(false);
                }}
                className={cn(
                  "aspect-[9/16] rounded-lg border-2 overflow-hidden transition-all relative",
                  isSelected
                    ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-1"
                    : "border-neutral-100 hover:border-neutral-300"
                )}
              >
                <img src={url} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono bg-black/50 text-white px-1 rounded">
                  {i}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Seed detail panel (right panel) ─────────────────────────────────────────

function allFrameUrls(r2Base: string, projectId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `${r2Base}/frames/${projectId}/f${String(i).padStart(4, "0")}.jpg`
  );
}

function SeedDetailPanel({
  scene,
  allScenes,
  projectId,
  updateScene,
  addSeedVersion,
  extractedFrameCount,
  r2PublicUrl,
  approvedHeroUrl,
}: {
  scene: SceneProductionState;
  allScenes: SceneProductionState[];
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  addSeedVersion: (sceneId: string, version: SeedVersion) => void;
  extractedFrameCount: number;
  r2PublicUrl: string;
  approvedHeroUrl: string | null;
}) {
  const [localGenerating, setLocalGenerating] = useState(false);
  const generating = localGenerating || (scene.seedGenerating ?? false);
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Auto-generate suggested seed prompt when scene has a kling prompt
  useEffect(() => {
    if (!scene.klingPrompt) { setSuggestedPrompt(null); return; }
    setSuggesting(true);
    const controller = new AbortController();

    // Different prompt strategy depending on whether hero model is set
    const heroMode = !!approvedHeroUrl;
    const basePrompt = heroMode
      ? `A hero model image has been approved and will be used as the base. Your job is to describe how to RE-POSE that character to match the starting frame of this scene.\n\nCRITICAL RULES:\n- The model's appearance (face, clothing, setting) is already defined by the hero image — do NOT re-describe them.\n- Focus ONLY on: body pose, hand position, product placement, facial expression, and camera framing that matches frame ${scene.referenceFrame}.\n- Describe the FIRST FRAME pose only — no motion.\n- Example: "Subject holds product at chest level, slight smile, looking directly at camera, medium close-up framing."\n\nScene direction: ${scene.klingPrompt}\nMatch the pose from frame ${scene.referenceFrame}.`
      : `Look at the reference frame image provided. Based on that frame and this scene direction, describe the single starting frame image that Kling needs as a seed to generate this clip.\n\nCRITICAL RULES:\n- NEVER describe the subject as "a young girl", "a woman", "a man", etc. ALWAYS refer to them as "model in reference" or "subject in reference frame". The seed image generator will match the person from the reference frame.\n- Match the wardrobe, setting, and lighting EXACTLY from the reference frame.\n- Describe what the viewer sees in the FIRST FRAME ONLY — subject pose, setting, lighting, wardrobe, expression, framing.\n- Do NOT describe motion or animation.\n\nScene direction: ${scene.klingPrompt}\nUsing frame ${scene.referenceFrame} as visual reference.`;

    fetch(`/api/projects/${projectId}/refine-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: basePrompt,
        target: "seed_image",
        sceneId: scene.sceneId,
      }),
      signal: controller.signal,
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.refined) {
          const suffix = heroMode
            ? `\n\nMatch pose from frame ${scene.referenceFrame}.`
            : `\n\nUse frame ${scene.referenceFrame} as reference.`;
          setSuggestedPrompt(`${d.refined}${suffix}`);
        }
      })
      .catch(() => {})
      .finally(() => setSuggesting(false));
    return () => controller.abort();
  }, [scene.klingPrompt, scene.referenceFrame, scene.sceneId, projectId, approvedHeroUrl]);
  const [genProgress, setGenProgress] = useState(0);
  const genStartRef = useRef<number | null>(null);

  // Track generation start time so progress survives re-renders
  useEffect(() => {
    if (generating && !genStartRef.current) {
      genStartRef.current = Date.now();
    } else if (!generating) {
      genStartRef.current = null;
    }
  }, [generating]);

  // Tick the progress bar
  useEffect(() => {
    if (!generating) {
      if (genProgress > 0 && genProgress < 100) {
        setGenProgress(100);
        const t = setTimeout(() => setGenProgress(0), 1000);
        return () => clearTimeout(t);
      }
      return;
    }
    const timer = setInterval(() => {
      const start = genStartRef.current ?? Date.now();
      const elapsed = (Date.now() - start) / 1000;
      // Fast to 30%, slow through middle, asymptotic near 95%
      const p = Math.min(95, elapsed < 5
        ? (elapsed / 5) * 30
        : 30 + (1 - Math.exp(-(elapsed - 5) / 15)) * 65);
      setGenProgress(Math.round(p));
    }, 500);
    return () => clearInterval(timer);
  }, [generating]);

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
    if (!scene.nanoBananaPrompt.trim() && !refinedPrompt) return;
    setRefining(true);
    try {
      const basePrompt = refinedPrompt ?? scene.nanoBananaPrompt;
      // Only add frame reference if frames exist (not concept mode)
      let withFrame = basePrompt;
      if (scene.referenceFrame > 0 || scene.referenceFrameUrl) {
        const frameRef = `Use frame ${scene.referenceFrame} as reference.`;
        withFrame = basePrompt.includes("Use frame ") ? basePrompt : `${basePrompt}\n\n${frameRef}`;
      }
      const promptToRefine = aiInstruction.trim()
        ? `${withFrame}\n\n[USER INSTRUCTION: ${aiInstruction.trim()}]`
        : withFrame;

      const res = await fetch(`/api/projects/${projectId}/refine-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptToRefine,
          target: "seed_image",
          sceneId: scene.sceneId,
        }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      const { refined } = (await res.json()) as { refined: string };
      setRefinedPrompt(refined);
      setAiInstruction("");
    } catch (err) {
      console.error("[enhance]", err);
    } finally {
      setRefining(false);
    }
  }

  async function handleGenerate() {
    const finalPrompt = refinedPrompt ?? scene.nanoBananaPrompt;
    if (!finalPrompt.trim()) return;
    setLocalGenerating(true);
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
            ...(approvedHeroUrl ? { heroImageUrl: approvedHeroUrl } : {}),
          }),
        }
      );
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({
          error: "Request failed",
        }))) as { error: string };
        throw new Error(error);
      }
      // Use the response directly — don't rely on SSE
      const data = (await res.json()) as {
        assetVersionId: string;
        imageUrl: string;
      };
      const newVersion: SeedVersion = {
        id: data.assetVersionId,
        createdAt: new Date().toISOString(),
        qualityScore: 0,
        color: scene.color,
        imageUrl: data.imageUrl,
        prompt: finalPrompt,
      };
      // Use addSeedVersion to avoid stale closure overwriting current state
      addSeedVersion(scene.sceneId, newVersion);
      setLocalGenerating(false);
    } catch (err) {
      console.error("[generate-seed]", err);
      setLocalGenerating(false);
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

  async function handleReject(versionId: string) {
    // Optimistically hide immediately
    updateScene(scene.sceneId, {
      seedVersions: scene.seedVersions.map((v) =>
        v.id === versionId ? { ...v, isRejected: true } : v
      ),
      ...(scene.approvedSeedVersionId === versionId
        ? { approvedSeedVersionId: null, seedImageApproved: false }
        : {}),
    });

    // Fire Claude analysis in the background — UI already updated
    fetch(`/api/projects/${projectId}/reject-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetVersionId: versionId }),
    })
      .then((res) => res.json())
      .then(({ rejectionReason }: { rejectionReason: string }) => {
        // Update with the analysis once it comes back
        updateScene(scene.sceneId, {
          seedVersions: scene.seedVersions.map((v) =>
            v.id === versionId ? { ...v, isRejected: true, rejectionReason } : v
          ),
        });
      })
      .catch(console.error);
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

  async function handleApplyToScenes(versionId: string, targetSceneIds: string[]) {
    try {
      const res = await fetch(`/api/projects/${projectId}/apply-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceVersionId: versionId, targetSceneIds }),
      });
      if (!res.ok) throw new Error("Apply failed");
      const data = (await res.json()) as {
        applied: Array<{ sceneId: string; versionId: string }>;
        sourceFileUrl: string;
        sourcePrompt: string | null;
      };

      // Update each target scene in client state
      for (const { sceneId, versionId: newVersionId } of data.applied) {
        const newVersion: SeedVersion = {
          id: newVersionId,
          createdAt: new Date().toISOString(),
          qualityScore: 0,
          color: scene.color,
          imageUrl: data.sourceFileUrl,
          prompt: data.sourcePrompt ?? undefined,
        };
        addSeedVersion(sceneId, newVersion);
        updateScene(sceneId, {
          approvedSeedVersionId: newVersionId,
          seedImageApproved: true,
        });
      }
    } catch (err) {
      console.error("[apply-seed]", err);
    }
  }

  async function handleEditVersion(existingImageUrl: string, editPrompt: string) {
    setLocalGenerating(true);
    updateScene(scene.sceneId, { seedGenerating: true });
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneId: scene.sceneId,
          prompt: editPrompt,
          baseImageUrl: existingImageUrl,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Edit failed" }));
        throw new Error(error);
      }
      const data = (await res.json()) as { assetVersionId: string; imageUrl: string };
      const newVersion: SeedVersion = {
        id: data.assetVersionId,
        createdAt: new Date().toISOString(),
        qualityScore: 0,
        color: scene.color,
        imageUrl: data.imageUrl,
        prompt: editPrompt,
      };
      addSeedVersion(scene.sceneId, newVersion);
    } catch (err) {
      console.error("[edit-version]", err);
    } finally {
      setLocalGenerating(false);
      updateScene(scene.sceneId, { seedGenerating: false });
    }
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

      {/* Hero mode indicator */}
      {approvedHeroUrl && (
        <div className="rounded-lg border border-violet-100 bg-violet-50/30 px-4 py-3 flex items-center gap-3">
          <img
            src={approvedHeroUrl}
            alt="Hero model"
            className="w-8 h-12 rounded object-cover border border-violet-200 shrink-0"
          />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-violet-400">
              Hero Mode Active
            </p>
            <p className="text-[11px] text-neutral-500">
              Seeds will use the approved hero model as base — prompts should describe pose & framing only
            </p>
          </div>
        </div>
      )}

      {/* Script & Motion from 3A */}
      {scene.klingPrompt && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-3 space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-blue-400">
            Script & Motion (from 3A)
          </p>
          <p className="text-xs text-neutral-600 leading-relaxed">
            {scene.klingPrompt}
          </p>
        </div>
      )}

      {/* Reference frame picker (collapsible) */}
      <ReferenceFramePicker
        scene={scene}
        projectId={projectId}
        updateScene={updateScene}
        extractedFrameCount={extractedFrameCount}
        r2PublicUrl={r2PublicUrl}
      />

      {/* Suggested seed prompt */}
      {(suggesting || suggestedPrompt) && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 px-4 py-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-500">
            Suggested Seed Prompt
          </p>
          {suggesting ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
              <span className="text-xs text-neutral-400">Generating suggestion…</span>
            </div>
          ) : suggestedPrompt ? (
            <>
              <textarea
                value={suggestedPrompt}
                onChange={(e) => setSuggestedPrompt(e.target.value)}
                rows={4}
                className="w-full text-xs rounded-md border border-emerald-200 bg-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 transition-all text-neutral-600 leading-relaxed"
              />
              <Button
                onClick={() => {
                  updateScene(scene.sceneId, { nanoBananaPrompt: suggestedPrompt });
                }}
                variant="outline"
                className="gap-2 h-8 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              >
                <Check className="h-3 w-3" />
                Use this prompt
              </Button>
            </>
          ) : null}
        </div>
      )}

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
        <div className="mt-2.5 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <PromptWithMentions
                value={aiInstruction}
                onChange={setAiInstruction}
                products={productTags}
                placeholder="e.g. add @product-name, change lighting to golden hour..."
                rows={1}
              />
            </div>
            <Button
              onClick={handleEnhance}
              disabled={refining || (!scene.nanoBananaPrompt.trim() && !refinedPrompt) || generating}
              variant="outline"
              className="gap-2 h-9 text-sm disabled:opacity-40 shrink-0"
            >
              {refining ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Enhancing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Enhance
                </>
              )}
            </Button>
          </div>
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
                              className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover/card:opacity-100 transition-opacity hover:bg-red-500/80"
                              title="Reject"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <SeedCardFooter
                          version={v}
                          index={i}
                          isApproved={isApproved}
                          projectId={projectId}
                          currentSceneId={scene.sceneId}
                          allScenes={allScenes}
                          productTags={productTags}
                          onApprove={() => handleApproveSeed(v.id)}
                          onUnapprove={handleUnapprove}
                          onPromptSaved={(newPrompt) => {
                            updateScene(scene.sceneId, {
                              seedVersions: scene.seedVersions.map((sv) =>
                                sv.id === v.id ? { ...sv, prompt: newPrompt } : sv
                              ),
                            });
                          }}
                          onApplyToScenes={handleApplyToScenes}
                          onEditVersion={handleEditVersion}
                        />
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
          <p className="text-sm text-neutral-400 mb-3">Generating seed image…</p>
          <div className="w-48 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${genProgress}%` }}
            />
          </div>
          <p className="text-xs text-neutral-300 mt-2 tabular-nums">
            {genProgress}%
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
  addSeedVersion: (sceneId: string, version: SeedVersion) => void;
  addScene: () => Promise<void>;
  removeScene: (sceneId: string) => Promise<void>;
  projectId: string;
  extractedFrameCount: number;
  r2PublicUrl: string;
  projectType: "reference" | "concept";
  heroImages: HeroImage[];
  approvedHeroUrl: string | null;
  onHeroImagesChange: (imgs: HeroImage[]) => void;
  onApprovedHeroChange: (url: string | null) => void;
  onHeroGeneratingChange: (generating: boolean) => void;
};

// ─── Hero Model Setup Panel ──────────────────────────────────────────────────

function HeroModelPanel({
  projectId,
  extractedFrameCount,
  r2PublicUrl,
  projectType,
  heroImages,
  approvedHeroUrl,
  onHeroImagesChange,
  onApprovedHeroChange,
  onGeneratingChange,
}: {
  projectId: string;
  extractedFrameCount: number;
  r2PublicUrl: string;
  projectType: "reference" | "concept";
  heroImages: HeroImage[];
  approvedHeroUrl: string | null;
  onHeroImagesChange: (imgs: HeroImage[]) => void;
  onApprovedHeroChange: (url: string | null) => void;
  onGeneratingChange: (generating: boolean) => void;
}) {
  const isConcept = projectType === "concept";
  const [expanded, setExpanded] = useState(!approvedHeroUrl);
  const [mode, setMode] = useState<"frame" | "scratch" | "upload">(isConcept ? "scratch" : "frame");
  const [selectedFrame, setSelectedFrame] = useState<number>(0);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Product tags for @mentions
  const [productTags, setProductTags] = useState<Array<{ slug: string; name: string; imageCount: number }>>([]);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ slug: string; name: string; imageCount?: number }>) =>
        setProductTags(data.map((p) => ({ slug: p.slug, name: p.name, imageCount: p.imageCount ?? 0 })))
      )
      .catch(() => {});
  }, []);

  const frames = allFrameUrls(r2PublicUrl, projectId, extractedFrameCount);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    onGeneratingChange(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-hero`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "scratch"
            ? { prompt, fromScratch: true }
            : { sourceFrame: selectedFrame, prompt }
        ),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(error);
      }
      const data = (await res.json()) as { heroImage: HeroImage; heroImages: HeroImage[] };
      onHeroImagesChange(data.heroImages);
    } catch (err) {
      console.error("[generate-hero]", err);
    } finally {
      setGenerating(false);
      onGeneratingChange(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    onGeneratingChange(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/upload-hero`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(error);
      }
      const data = (await res.json()) as { heroImage: HeroImage; heroImages: HeroImage[] };
      onHeroImagesChange(data.heroImages);
    } catch (err) {
      console.error("[upload-hero]", err);
    } finally {
      setUploading(false);
      onGeneratingChange(false);
    }
  }

  async function handleApprove(url: string) {
    try {
      await fetch(`/api/projects/${projectId}/generate-hero`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedHeroUrl: url }),
      });
      onApprovedHeroChange(url);
      setExpanded(false); // collapse after approval
    } catch (err) {
      console.error("[approve-hero]", err);
    }
  }

  async function handleUnapprove() {
    try {
      await fetch(`/api/projects/${projectId}/generate-hero`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedHeroUrl: "" }),
      });
      onApprovedHeroChange(null);
    } catch (err) {
      console.error("[unapprove-hero]", err);
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-hero`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeHeroId: id }),
      });
      if (res.ok) {
        const data = (await res.json()) as { heroImages: HeroImage[]; approvedHeroUrl: string | null };
        onHeroImagesChange(data.heroImages);
        if (data.approvedHeroUrl !== undefined) onApprovedHeroChange(data.approvedHeroUrl);
      }
    } catch (err) {
      console.error("[remove-hero]", err);
    }
  }

  const approvedHero = heroImages.find((h) => h.url === approvedHeroUrl);

  return (
    <div className="border-b border-neutral-200 bg-neutral-50/50">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-neutral-100/50 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-800">Model & Setting</p>
          <p className="text-[11px] text-neutral-400">
            {approvedHeroUrl
              ? "Hero model approved — used as base for all scene seeds"
              : "Generate a base model image to use across all scenes"}
          </p>
        </div>
        {approvedHero && (
          <img
            src={approvedHero.url}
            alt="Hero"
            className="w-10 h-14 rounded object-cover border border-neutral-200 shrink-0"
          />
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-neutral-400 transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-6 pb-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5 w-fit">
            {extractedFrameCount > 0 && (
              <button
                onClick={() => setMode("frame")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  mode === "frame"
                    ? "bg-white text-neutral-800 shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700"
                )}
              >
                From Frame
              </button>
            )}
            <button
              onClick={() => setMode("scratch")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                mode === "scratch"
                  ? "bg-white text-neutral-800 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              )}
            >
              From Scratch
            </button>
            <button
              onClick={() => setMode("upload")}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                mode === "upload"
                  ? "bg-white text-neutral-800 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              )}
            >
              Upload
            </button>
          </div>

          {/* Frame picker — only in "From Frame" mode */}
          {mode === "frame" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-neutral-500">Source Frame</p>
                <button
                  onClick={() => setShowFramePicker(!showFramePicker)}
                  className="text-[11px] text-violet-500 hover:text-violet-700 transition-colors flex items-center gap-1"
                >
                  {showFramePicker ? "Hide frames" : "Choose frame"}
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showFramePicker && "rotate-90")} />
                </button>
              </div>

              {frames[selectedFrame] && !showFramePicker && (
                <div className="flex items-center gap-3">
                  <img
                    src={frames[selectedFrame]}
                    alt={`Frame ${selectedFrame}`}
                    className="w-16 h-28 rounded-lg object-cover border border-neutral-200"
                  />
                  <span className="text-xs text-neutral-500">Frame {selectedFrame}</span>
                </div>
              )}

              {showFramePicker && (
                <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 p-2 bg-white">
                  {frames.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedFrame(i); setShowFramePicker(false); }}
                      className={cn(
                        "aspect-[9/16] rounded overflow-hidden border-2 transition-all",
                        i === selectedFrame
                          ? "border-violet-500 ring-1 ring-violet-500"
                          : "border-transparent hover:border-neutral-300"
                      )}
                    >
                      <img src={url} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === "upload" ? (
            /* Upload mode */
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-8 rounded-xl border-2 border-dashed border-violet-200 hover:border-violet-400 bg-violet-50/30 flex flex-col items-center gap-2 transition-colors"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
                    <span className="text-sm text-violet-500">Uploading & resizing to 9:16…</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-6 w-6 text-violet-400" />
                    <span className="text-sm text-violet-600 font-medium">Click to upload an image</span>
                    <span className="text-[11px] text-neutral-400">Will be resized to 720x1280 (9:16)</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Generate mode (frame or scratch) */
            <>
              <div>
                <p className="text-xs font-medium text-neutral-500 mb-1.5">
                  {mode === "scratch" ? "Describe your character from scratch" : "Describe your model + setting"}
                </p>
                <PromptWithMentions
                  value={prompt}
                  onChange={setPrompt}
                  products={productTags}
                  placeholder={mode === "scratch"
                    ? "e.g. young woman wearing red @airplane-hoodie, standing in front of brick wall, natural lighting, portrait style, 9:16 vertical..."
                    : "e.g. model in reference wearing blue @airplane-hoodie standing in front of a brick wall, natural lighting, portrait style..."
                  }
                  rows={3}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="gap-2 bg-violet-600 hover:bg-violet-500 text-white h-9 text-sm disabled:opacity-40"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating Hero…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" />
                    Generate Model & Setting
                  </>
                )}
              </Button>
            </>
          )}

          {/* Generated hero images */}
          {heroImages.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-2">
                Click an image to use as your hero model
              </p>
              <div className="grid grid-cols-4 gap-3">
                {heroImages.map((h) => {
                  const isApproved = h.url === approvedHeroUrl;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => isApproved ? handleUnapprove() : handleApprove(h.url)}
                      className={cn(
                        "rounded-lg border-2 overflow-hidden transition-all text-left group/hero cursor-pointer",
                        isApproved
                          ? "border-violet-600 ring-2 ring-violet-600 ring-offset-1"
                          : "border-neutral-200 hover:border-violet-400 hover:shadow-md"
                      )}
                    >
                      <div className="aspect-[9/16] relative overflow-hidden">
                        <img
                          src={h.url}
                          alt="Hero model"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        {isApproved ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-violet-600/20">
                            <div className="bg-white rounded-full p-1.5 shadow-lg">
                              <Check className="h-4 w-4 text-violet-600" />
                            </div>
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/hero:bg-black/20 transition-colors">
                            <span className="text-white text-xs font-medium bg-black/60 px-3 py-1.5 rounded-full opacity-0 group-hover/hero:opacity-100 transition-opacity">
                              Select
                            </span>
                          </div>
                        )}
                        {/* Remove button — stop propagation so it doesn't trigger select */}
                        {!isApproved && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); handleRemove(h.id); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleRemove(h.id); } }}
                            className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover/hero:opacity-100 transition-opacity hover:bg-red-500/80"
                            title="Remove"
                          >
                            <Trash2 className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                      <div className="bg-white px-2.5 py-2">
                        <p className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
                          {h.prompt}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[10px] text-neutral-300">
                            Frame {h.sourceFrame}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] font-medium px-2 py-0.5 rounded",
                              isApproved
                                ? "bg-violet-600 text-white"
                                : "bg-neutral-100 text-neutral-500"
                            )}
                          >
                            {isApproved ? "Selected" : "Click to select"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab3A ────────────────────────────────────────────────────────────────────

export function Tab3A({
  scenes, updateScene, addSeedVersion, addScene, removeScene,
  projectId, extractedFrameCount, r2PublicUrl, projectType,
  heroImages, approvedHeroUrl, onHeroImagesChange, onApprovedHeroChange, onHeroGeneratingChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    scenes[0]?.sceneId ?? ""
  );
  const selected = scenes.find((s) => s.sceneId === selectedId) ?? scenes[0];
  const approvedCount = scenes.filter((s) => s.seedImageApproved).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Hero Model Setup (project-level, above scene split) */}
      <HeroModelPanel
        projectId={projectId}
        extractedFrameCount={extractedFrameCount}
        r2PublicUrl={r2PublicUrl}
        projectType={projectType}
        heroImages={heroImages}
        approvedHeroUrl={approvedHeroUrl}
        onHeroImagesChange={onHeroImagesChange}
        onApprovedHeroChange={onApprovedHeroChange}
        onGeneratingChange={onHeroGeneratingChange}
      />

      {/* Scene split: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene list (left, fixed width) */}
        <div className="w-72 shrink-0 border-r border-neutral-200 overflow-y-auto bg-white flex flex-col">
          <div className="px-4 py-2.5 border-b border-neutral-100 sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between">
            <p className="text-xs text-neutral-400">
              {approvedCount}/{scenes.length} seeds approved
            </p>
            <button
              onClick={addScene}
              className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              title="Add scene"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {scenes.map((scene) => (
              <div key={scene.sceneId} className="relative group/scene">
                <SceneListItem
                  scene={scene}
                  isSelected={scene.sceneId === selectedId}
                  onSelect={() => setSelectedId(scene.sceneId)}
                />
                {scenes.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (scene.sceneId === selectedId && scenes.length > 1) {
                        const idx = scenes.findIndex((s) => s.sceneId === scene.sceneId);
                        const next = scenes[idx === 0 ? 1 : idx - 1];
                        if (next) setSelectedId(next.sceneId);
                      }
                      void removeScene(scene.sceneId);
                    }}
                    className="absolute top-2 right-2 p-1 rounded bg-white/80 text-neutral-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/scene:opacity-100 transition-all"
                    title="Remove scene"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel (right, scrollable) */}
        <div className="flex-1 overflow-y-auto">
          {selected && (
            <SeedDetailPanel
              key={selected.sceneId}
              scene={selected}
              allScenes={scenes}
              projectId={projectId}
              addSeedVersion={addSeedVersion}
              updateScene={updateScene}
              extractedFrameCount={extractedFrameCount}
              r2PublicUrl={r2PublicUrl}
              approvedHeroUrl={approvedHeroUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}
