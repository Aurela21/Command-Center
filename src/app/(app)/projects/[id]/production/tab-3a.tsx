"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronRight, Copy, Download, GripVertical, Loader2, Package, Pencil, Plus, Sparkles, Trash2, Upload, User, Wand2, X } from "lucide-react";
import type { SceneProductionState, SeedVersion, HeroImage } from "./types";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
        "w-full text-left flex items-start gap-3 px-4 py-3 border-b border-[#1a1a1e] transition-colors",
        isSelected ? "bg-[#6366f1]" : "hover:bg-[#27272a]"
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
              isSelected ? "text-white/60" : "text-[#71717a]"
            )}
          >
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span
            className={cn(
              "text-xs tabular-nums",
              isSelected ? "text-white/40" : "text-[#71717a]"
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
                isSelected ? "text-white/60" : "text-[#71717a]"
              )}
            />
          )}
          {scene.seedVersions.length > 0 && !scene.seedImageApproved && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                isSelected
                  ? "bg-white/10 text-white/60"
                  : "bg-[#27272a] text-[#a1a1aa]"
              )}
            >
              {scene.seedVersions.length}v
            </span>
          )}
        </div>
        <p
          className={cn(
            "text-xs leading-snug line-clamp-2",
            isSelected ? "text-white/70" : "text-[#a1a1aa]"
          )}
        >
          {scene.description}
        </p>
      </div>
    </button>
  );
}

// ─── Sortable scene list item (wraps SceneListItem with drag handle) ─────────

function SortableSceneItem({
  scene,
  isSelected,
  onSelect,
  canRemove,
  onRemove,
}: {
  scene: SceneProductionState;
  isSelected: boolean;
  onSelect: () => void;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.sceneId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined };

  return (
    <div ref={setNodeRef} style={style} className="relative group/scene">
      <div className="flex items-center">
        <div {...attributes} {...listeners} className="shrink-0 px-1 cursor-grab active:cursor-grabbing text-[#52525b] hover:text-[#a1a1aa]">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <SceneListItem scene={scene} isSelected={isSelected} onSelect={onSelect} />
        </div>
      </div>
      {canRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 p-1 rounded bg-black/60 text-[#52525b] hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/scene:opacity-100 transition-all"
          title="Remove scene"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
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
        className="w-full text-sm rounded-md border border-[#27272a] px-3 py-2.5 bg-[#18181b] resize-none focus:outline-none focus:ring-2 focus:ring-[#27272a] focus:border-[#3f3f46] transition-all placeholder:text-[#71717a] text-[#fafafa]"
      />

      {/* Autocomplete dropdown */}
      {showMenu && filtered.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-[#18181b] border border-[#27272a] rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
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
                  ? "bg-orange-500/10"
                  : "hover:bg-[#27272a]"
              )}
            >
              <div className="shrink-0 w-7 h-7 rounded bg-orange-500/20 flex items-center justify-center">
                <Package className="h-3.5 w-3.5 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#fafafa] truncate">
                  {p.name}
                </p>
                <p className="text-[11px] text-orange-500 font-mono">
                  @{p.slug}
                  <span className="text-[#52525b] ml-1.5">
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
    <div className="bg-[#18181b]">
      {/* Score + Approve + Edit row */}
      <div className="px-2.5 py-2 flex items-center justify-between gap-1.5">
        <span
          className={cn(
            "text-xs font-semibold tabular-nums shrink-0",
            version.qualityScore >= 80
              ? "text-emerald-600"
              : version.qualityScore >= 65
              ? "text-amber-600"
              : "text-[#71717a]"
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
              className="text-[11px] font-medium px-2 py-0.5 rounded transition-colors bg-[#27272a] text-[#a1a1aa] hover:bg-amber-500/10 hover:text-amber-400"
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
                ? "bg-[#6366f1] text-white"
                : "bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]"
            )}
          >
            {isApproved ? "Approved" : "Approve"}
          </button>
        </div>
      </div>

      {/* Edit image field */}
      {showEditField && version.imageUrl && (
        <div className="border-t border-[#1a1a1e] px-2.5 py-2 space-y-1.5">
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
        <div className="border-t border-[#1a1a1e]">
          <button
            onClick={() => {
              setShowApplyPanel(!showApplyPanel);
              if (!showApplyPanel) {
                // Pre-select no scenes
                setApplyTargets(new Set());
              }
            }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#27272a] transition-colors"
          >
            <Copy className="h-3 w-3 text-[#71717a] shrink-0" />
            <span className="text-[11px] text-[#a1a1aa]">Apply to other scenes</span>
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
                          ? "bg-[#6366f1] text-white"
                          : "bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]"
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
                  className="text-[10px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
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
                  className="text-[11px] font-medium text-white bg-[#6366f1] hover:bg-[#6366f1]/80 px-2.5 py-1 rounded transition-colors disabled:opacity-40"
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
        <div className="border-t border-[#1a1a1e]">
          <button
            onClick={() => { setExpanded(!expanded); setEditing(false); }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#27272a] transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 text-[#71717a] transition-transform shrink-0",
                expanded && "rotate-180"
              )}
            />
            <span className="text-[11px] text-[#a1a1aa] truncate flex-1">
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
                    className="w-full text-[11px] rounded border border-[#27272a] px-2 py-1.5 bg-[#18181b] resize-none focus:outline-none focus:ring-2 focus:ring-[#27272a] transition-all leading-relaxed text-[#fafafa]"
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
                    <span className="text-[10px] text-[#71717a]">
                      {"\u2318"}+Enter to save &middot; Esc to cancel
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setDraft(version.prompt ?? "");
                          setEditing(false);
                        }}
                        className="text-[11px] text-[#71717a] hover:text-[#a1a1aa] px-1.5 py-0.5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="text-[11px] font-medium text-white bg-[#6366f1] hover:bg-[#6366f1]/80 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
                    {promptText}
                  </p>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-[11px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
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
        <div className="border-t border-[#1a1a1e] px-2.5 py-1.5">
          <span className="text-[11px] text-[#52525b] italic">No prompt recorded</span>
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
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
          Reference Frame
          <span className="text-[#52525b] font-normal ml-2 normal-case tracking-normal">
            {extractedFrameCount} available
          </span>
        </p>
        <button
          onClick={() => setOpen(!open)}
          className="text-[11px] text-[#a1a1aa] hover:text-[#fafafa] transition-colors flex items-center gap-1"
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
            className="w-14 h-24 rounded-lg object-cover border-2 border-[#6366f1]"
          />
          <span className="text-xs text-[#a1a1aa]">Frame {scene.referenceFrame}</span>
        </div>
      )}

      {/* Expanded: frame grid */}
      {open && (
        <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto rounded-lg border border-[#27272a] p-2 bg-[#09090b]/50">
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
                    ? "border-[#6366f1] ring-2 ring-[#6366f1] ring-offset-1"
                    : "border-[#1a1a1e] hover:border-[#3f3f46]"
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

// ─── Seed upload button ──────────────────────────────────────────────────────

function SeedUploadButton({
  projectId,
  sceneId,
  color,
  addSeedVersion,
}: {
  projectId: string;
  sceneId: string;
  color: string;
  addSeedVersion: (sceneId: string, version: SeedVersion) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sceneId", sceneId);
      const res = await fetch(`/api/projects/${projectId}/upload-seed`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { assetVersionId: string; imageUrl: string };
      addSeedVersion(sceneId, {
        id: data.assetVersionId,
        createdAt: new Date().toISOString(),
        qualityScore: 0,
        color,
        imageUrl: data.imageUrl,
        prompt: "Uploaded image",
      });
    } catch (err) {
      console.error("[upload-seed]", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#fafafa] disabled:opacity-40 transition-colors"
      >
        {uploading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
        ) : (
          <><Upload className="h-3.5 w-3.5" /> Upload seed image</>
        )}
      </button>
    </>
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
  productTags,
}: {
  scene: SceneProductionState;
  allScenes: SceneProductionState[];
  projectId: string;
  updateScene: (sceneId: string, patch: Partial<SceneProductionState>) => void;
  addSeedVersion: (sceneId: string, version: SeedVersion) => void;
  extractedFrameCount: number;
  r2PublicUrl: string;
  approvedHeroUrl: string | null;
  productTags: ProductTag[];
}) {
  const [localGenerating, setLocalGenerating] = useState(false);
  const generating = localGenerating || (scene.seedGenerating ?? false);
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [swapPromptEdits, setSwapPromptEdits] = useState<Record<string, string>>({});

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

  // Build deterministic product swap prompts — one per product, no API call
  const swapPrompts = productTags.map((p) => ({
    slug: p.slug,
    name: p.name,
    prompt: `Recreate this exact image — same subject, same pose, same setting, same lighting, same camera angle, same composition — but replace the garment the subject is wearing with the @${p.slug}. The @${p.slug} product reference images are the source of truth for what the product looks like. Keep everything else identical to the reference frame. Use frame ${scene.referenceFrame} as reference.`,
  }));

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
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: Prompting ── */}
      <div className="w-1/2 overflow-y-auto p-6 space-y-5 border-r border-[#27272a]">
        {/* Scene header */}
        <div className="flex items-end gap-3">
          <span className="text-5xl font-light leading-none text-[#1a1a1e] tabular-nums select-none">
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <div className="mb-0.5 space-y-0.5">
            <p className="text-sm font-medium text-[#a1a1aa]">
              {scene.targetClipDurationS.toFixed(1)}s target clip
            </p>
            <p className="text-xs text-[#71717a] leading-relaxed line-clamp-2">
              {scene.description}
            </p>
          </div>
        </div>

        {/* Hero mode indicator */}
        {approvedHeroUrl && (
          <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 flex items-center gap-2.5">
            <img
              src={approvedHeroUrl}
              alt="Hero model"
              className="w-7 h-10 rounded object-cover border border-violet-200 shrink-0"
            />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-violet-400">
                Hero Mode Active
              </p>
              <p className="text-[11px] text-[#a1a1aa]">
                Prompts should describe pose & framing only
              </p>
            </div>
          </div>
        )}

        {/* Script & Motion */}
        {scene.klingPrompt && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-blue-400">
              Script & Motion
            </p>
            <p className="text-xs text-[#a1a1aa] leading-relaxed">
              {scene.klingPrompt}
            </p>
          </div>
        )}

        {/* Reference frame picker */}
        <ReferenceFramePicker
          scene={scene}
          projectId={projectId}
          updateScene={updateScene}
          extractedFrameCount={extractedFrameCount}
          r2PublicUrl={r2PublicUrl}
        />

        {/* Seed Image Prompt */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-2">
            Seed Image Prompt
          </p>
          <PromptWithMentions
            value={scene.nanoBananaPrompt}
            onChange={(val) => updateScene(scene.sceneId, { nanoBananaPrompt: val })}
            products={productTags}
            placeholder="Describe the seed image… Type @ to reference a product"
            rows={4}
          />
          <Button
            onClick={handleGenerate}
            disabled={generating || !scene.nanoBananaPrompt.trim()}
            className="mt-2 gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm disabled:opacity-40 w-full"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Wand2 className="h-3.5 w-3.5" />
                Generate
              </>
            )}
          </Button>
        </div>

        {/* Suggested Seed Prompt (green) */}
        {(suggesting || suggestedPrompt) && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-widest text-emerald-500">
              Suggested Seed Prompt
            </p>
            {suggesting ? (
              <div className="flex items-center gap-2 py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                <span className="text-xs text-[#71717a]">Generating…</span>
              </div>
            ) : suggestedPrompt ? (
              <>
                <textarea
                  value={suggestedPrompt}
                  onChange={(e) => setSuggestedPrompt(e.target.value)}
                  rows={3}
                  className="w-full text-xs rounded-md border border-emerald-500/20 bg-[#18181b] px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all text-[#e4e4e7] leading-relaxed"
                />
                <Button
                  onClick={() => updateScene(scene.sceneId, { nanoBananaPrompt: suggestedPrompt })}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  <Check className="h-3 w-3" />
                  Use this prompt
                </Button>
              </>
            ) : null}
          </div>
        )}

        {/* Product Swap Prompts (orange) — one per product, deterministic */}
        {swapPrompts.length > 0 && (scene.referenceFrameUrl || scene.referenceFrame > 0) && (
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 space-y-2.5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-orange-500">
              Product Swap Prompt
            </p>
            {swapPrompts.map((sp) => (
              <div key={sp.slug} className="space-y-1.5">
                {swapPrompts.length > 1 && (
                  <p className="text-[10px] font-medium text-orange-400">@{sp.slug}</p>
                )}
                <textarea
                  value={swapPromptEdits[sp.slug] ?? sp.prompt}
                  onChange={(e) => setSwapPromptEdits((prev) => ({ ...prev, [sp.slug]: e.target.value }))}
                  rows={3}
                  className="w-full text-xs rounded-md border border-orange-500/20 bg-[#18181b] px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/30 transition-all text-[#e4e4e7] leading-relaxed"
                />
                <Button
                  onClick={() => updateScene(scene.sceneId, { nanoBananaPrompt: swapPromptEdits[sp.slug] ?? sp.prompt })}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                >
                  <Package className="h-3 w-3" />
                  Use swap prompt
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Enhance + Generate */}
        <div className="space-y-2">
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
              className="gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm disabled:opacity-40"
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
          <SeedUploadButton
            projectId={projectId}
            sceneId={scene.sceneId}
            color={scene.color}
            addSeedVersion={addSeedVersion}
          />
        </div>

        {/* Enhanced prompt (shown after enhancement) */}
        {refinedPrompt !== null && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-widest text-[#71717a]">
                Enhanced Prompt
              </p>
              <button
                onClick={() => setRefinedPrompt(null)}
                className="text-[11px] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
              >
                Discard
              </button>
            </div>
            <textarea
              value={refinedPrompt}
              onChange={(e) => setRefinedPrompt(e.target.value)}
              rows={4}
              className="w-full text-sm rounded-md border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all text-[#a1a1aa] leading-relaxed"
            />
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="mt-2 gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm disabled:opacity-40"
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
      </div>

      {/* ── RIGHT: Generations ── */}
      <div className="w-1/2 overflow-y-auto p-6">
        {scene.seedVersions.length > 0 ? (
          <div>
            {(() => {
              const active = scene.seedVersions.filter((v) => !v.isRejected);
              const rejected = scene.seedVersions.filter((v) => v.isRejected);
              return (
                <>
                  <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-3">
                    Generated Versions
                    {rejected.length > 0 && (
                      <span className="text-[#52525b] font-normal ml-1">
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
                              ? "border-[#6366f1] ring-2 ring-[#6366f1] ring-offset-1"
                              : "border-[#1a1a1e] hover:border-[#3f3f46]"
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
                                  <Check className="h-3.5 w-3.5 text-[#6366f1]" />
                                </div>
                              </div>
                            )}
                            <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                              {v.imageUrl && (
                                <a
                                  href={v.imageUrl}
                                  download={`seed-scene${String(scene.sceneOrder).padStart(2, "0")}-v${i + 1}.jpg`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-black/40 text-white hover:bg-[#27272a]/80 transition-colors"
                                  title="Download"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    fetch(v.imageUrl!)
                                      .then((r) => r.blob())
                                      .then((blob) => {
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `seed-scene${String(scene.sceneOrder).padStart(2, "0")}-v${i + 1}.jpg`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                      });
                                  }}
                                >
                                  <Download className="h-3 w-3" />
                                </a>
                              )}
                              {!isApproved && (
                                <button
                                  onClick={() => handleReject(v.id)}
                                  className="p-1.5 rounded-lg bg-black/40 text-white hover:bg-red-500/80 transition-colors"
                                  title="Reject"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
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

                  {rejected.length > 0 && (
                    <details className="mt-4">
                      <summary className="text-xs text-[#71717a] cursor-pointer hover:text-[#a1a1aa] transition-colors">
                        {rejected.length} rejected version{rejected.length !== 1 ? "s" : ""} — click to view
                      </summary>
                      <div className="mt-2 space-y-2">
                        {rejected.map((v, i) => (
                          <div key={v.id} className="flex gap-3 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
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
                                <p className="text-[11px] text-[#a1a1aa] leading-relaxed mt-0.5 whitespace-pre-line">
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
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[#27272a] rounded-xl">
            <Loader2 className="h-8 w-8 text-[#52525b] mb-3 animate-spin" />
            <p className="text-sm text-[#71717a] mb-3">Generating seed image…</p>
            <div className="w-48 h-2 bg-[#27272a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6366f1] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${genProgress}%` }}
              />
            </div>
            <p className="text-xs text-[#52525b] mt-2 tabular-nums">
              {genProgress}%
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-[#27272a] rounded-xl">
            <Wand2 className="h-8 w-8 text-[#27272a] mb-3" />
            <p className="text-sm text-[#71717a]">No seed images yet</p>
            <p className="text-xs text-[#71717a] mt-1">
              Write a prompt and click Generate
            </p>
          </div>
        )}
      </div>
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
  productTags: ProductTag[];
  initialSelectedSceneId: string | null;
  onReorderScenes: (sceneIds: string[]) => void;
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
  productTags,
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
  productTags: ProductTag[];
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
    <div className="border-b border-[#27272a] bg-[#09090b]/50">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-[#27272a]/50 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#fafafa]">Model & Setting</p>
          <p className="text-[11px] text-[#71717a]">
            {approvedHeroUrl
              ? "Hero model approved — used as base for all scene seeds"
              : "Generate a base model image to use across all scenes"}
          </p>
        </div>
        {approvedHero && (
          <img
            src={approvedHero.url}
            alt="Hero"
            className="w-10 h-14 rounded object-cover border border-[#27272a] shrink-0"
          />
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[#71717a] transition-transform shrink-0",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded content — compact horizontal layout */}
      {expanded && (
        <div className="px-6 pb-4 space-y-3">
          {/* Row 1: mode toggle + source frame + prompt + generate — all inline */}
          <div className="flex gap-3 items-start">
            {/* Source frame thumbnail (From Frame mode) */}
            {mode === "frame" && frames[selectedFrame] && (
              <button
                onClick={() => setShowFramePicker(!showFramePicker)}
                className="shrink-0 relative group/frame"
                title="Change frame"
              >
                <img
                  src={frames[selectedFrame]}
                  alt={`Frame ${selectedFrame}`}
                  className="w-12 h-20 rounded-lg object-cover border border-[#27272a]"
                />
                <div className="absolute inset-0 bg-black/0 group-hover/frame:bg-black/30 rounded-lg transition-colors flex items-center justify-center">
                  <Pencil className="h-3 w-3 text-white opacity-0 group-hover/frame:opacity-100 transition-opacity" />
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] bg-[#27272a] text-[#a1a1aa] px-1 rounded">f{selectedFrame}</span>
              </button>
            )}

            {/* Prompt + mode toggle + button */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* Mode toggle */}
              <div className="flex gap-1 bg-[#27272a] rounded-lg p-0.5 w-fit">
                {extractedFrameCount > 0 && (
                  <button
                    onClick={() => setMode("frame")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                      mode === "frame"
                        ? "bg-[#18181b] text-[#fafafa] shadow-sm"
                        : "text-[#a1a1aa] hover:text-[#fafafa]"
                    )}
                  >
                    From Frame
                  </button>
                )}
                <button
                  onClick={() => setMode("scratch")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                    mode === "scratch"
                      ? "bg-[#18181b] text-[#fafafa] shadow-sm"
                      : "text-[#a1a1aa] hover:text-[#fafafa]"
                  )}
                >
                  From Scratch
                </button>
                <button
                  onClick={() => setMode("upload")}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                    mode === "upload"
                      ? "bg-[#18181b] text-[#fafafa] shadow-sm"
                      : "text-[#a1a1aa] hover:text-[#fafafa]"
                  )}
                >
                  Upload
                </button>
              </div>

              {mode === "upload" ? (
                <div>
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
                    className="w-full py-4 rounded-lg border-2 border-dashed border-[#3f3f46] hover:border-violet-400 bg-[#18181b] flex items-center justify-center gap-2 transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                        <span className="text-xs text-[#a1a1aa]">Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-[#71717a]" />
                        <span className="text-xs text-[#a1a1aa]">Upload image (resized to 9:16)</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <PromptWithMentions
                      value={prompt}
                      onChange={setPrompt}
                      products={productTags}
                      placeholder={mode === "scratch"
                        ? "e.g. young woman wearing red @airplane-hoodie, standing in front of brick wall, natural lighting..."
                        : "e.g. model in reference wearing blue @airplane-hoodie, brick wall, natural lighting..."
                      }
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || !prompt.trim()}
                    className="gap-1.5 bg-violet-600 hover:bg-violet-500 text-white h-[52px] text-xs disabled:opacity-40 shrink-0"
                  >
                    {generating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5" />
                    )}
                    {generating ? "Generating…" : "Generate"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Frame picker (only when toggled) */}
          {mode === "frame" && showFramePicker && (
            <div className="grid grid-cols-10 gap-1.5 max-h-36 overflow-y-auto rounded-lg border border-[#27272a] p-2 bg-[#18181b]">
              {frames.map((url, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedFrame(i); setShowFramePicker(false); }}
                  className={cn(
                    "aspect-[9/16] rounded overflow-hidden border-2 transition-all",
                    i === selectedFrame
                      ? "border-violet-500 ring-1 ring-violet-500"
                      : "border-transparent hover:border-[#3f3f46]"
                  )}
                >
                  <img src={url} alt={`Frame ${i}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Generated hero images — horizontal strip */}
          {heroImages.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-[10px] text-[#52525b] uppercase tracking-wider shrink-0">Heroes</span>
              {heroImages.map((h) => {
                const isApproved = h.url === approvedHeroUrl;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => isApproved ? handleUnapprove() : handleApprove(h.url)}
                    className={cn(
                      "shrink-0 w-12 h-20 rounded-lg border-2 overflow-hidden transition-all relative group/hero",
                      isApproved
                        ? "border-violet-600 ring-1 ring-violet-600"
                        : "border-[#27272a] hover:border-violet-400"
                    )}
                  >
                    <img src={h.url} alt="Hero" className="w-full h-full object-cover" />
                    {isApproved && (
                      <div className="absolute inset-0 flex items-center justify-center bg-violet-600/20">
                        <Check className="h-3.5 w-3.5 text-white drop-shadow" />
                      </div>
                    )}
                    {!isApproved && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleRemove(h.id); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleRemove(h.id); } }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover/hero:opacity-100 transition-opacity hover:bg-red-500/80"
                      >
                        <X className="h-2.5 w-2.5" />
                      </div>
                    )}
                  </button>
                );
              })}
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
  productTags, initialSelectedSceneId, onReorderScenes,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>(
    scenes[0]?.sceneId ?? ""
  );

  // Sync selection when navigating from another tab (e.g. Review Pairs "Edit seed")
  useEffect(() => {
    if (initialSelectedSceneId && scenes.some((s) => s.sceneId === initialSelectedSceneId)) {
      setSelectedId(initialSelectedSceneId);
    }
  }, [initialSelectedSceneId, scenes]);

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
        productTags={productTags}
      />

      {/* Scene split: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scene list (left, fixed width) */}
        <div className="w-72 shrink-0 border-r border-[#27272a] overflow-y-auto bg-[#18181b] flex flex-col">
          <div className="px-4 py-2.5 border-b border-[#1a1a1e] sticky top-0 bg-[#18181b]/95 backdrop-blur-sm z-10 flex items-center justify-between">
            <p className="text-xs text-[#71717a]">
              {approvedCount}/{scenes.length} seeds approved
            </p>
            <button
              onClick={addScene}
              className="p-1 rounded hover:bg-[#27272a] text-[#71717a] hover:text-[#a1a1aa] transition-colors"
              title="Add scene"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              const oldIdx = scenes.findIndex((s) => s.sceneId === active.id);
              const newIdx = scenes.findIndex((s) => s.sceneId === over.id);
              if (oldIdx === -1 || newIdx === -1) return;
              const reordered = [...scenes];
              const [moved] = reordered.splice(oldIdx, 1);
              reordered.splice(newIdx, 0, moved);
              const newIds = reordered.map((s) => s.sceneId);
              onReorderScenes(newIds);
            }}
          >
            <SortableContext items={scenes.map((s) => s.sceneId)} strategy={verticalListSortingStrategy}>
              <div className="flex-1 overflow-y-auto">
                {scenes.map((scene) => (
                  <SortableSceneItem
                    key={scene.sceneId}
                    scene={scene}
                    isSelected={scene.sceneId === selectedId}
                    onSelect={() => setSelectedId(scene.sceneId)}
                    canRemove={scenes.length > 1}
                    onRemove={() => {
                      if (scene.sceneId === selectedId && scenes.length > 1) {
                        const idx = scenes.findIndex((s) => s.sceneId === scene.sceneId);
                        const next = scenes[idx === 0 ? 1 : idx - 1];
                        if (next) setSelectedId(next.sceneId);
                      }
                      void removeScene(scene.sceneId);
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
              productTags={productTags}
            />
          )}
        </div>
      </div>
    </div>
  );
}
