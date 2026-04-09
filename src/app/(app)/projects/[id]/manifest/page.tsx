"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Check,
  Scissors,
  Layers,
  Trash2,
  Sparkles,
  Pencil,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  MOCK_SCENES,
  MOCK_TOTAL_DURATION_MS,
  SCENE_COLORS,
  candidateFrames,
  type MockScene,
} from "./mock-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msToTimecode(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sceneColor(index: number): string {
  return SCENE_COLORS[index % SCENE_COLORS.length];
}

// ---------------------------------------------------------------------------
// BoundaryBadge
// ---------------------------------------------------------------------------

function BoundaryBadge({ source }: { source: MockScene["boundarySource"] }) {
  if (source === "ai") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
        <Sparkles className="h-3 w-3" />
        AI
      </span>
    );
  }
  if (source === "user_adjusted") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
        <Pencil className="h-3 w-3" />
        Adjusted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
      <PlusCircle className="h-3 w-3" />
      Created
    </span>
  );
}

// ---------------------------------------------------------------------------
// ManifestTimeline
// ---------------------------------------------------------------------------

function ManifestTimeline({
  scenes,
  selectedId,
  onSelect,
  totalDurationMs,
}: {
  scenes: MockScene[];
  selectedId: string;
  onSelect: (id: string) => void;
  totalDurationMs: number;
}) {
  return (
    <div className="flex h-10 rounded-lg overflow-hidden gap-px bg-neutral-200">
      {scenes.map((scene, i) => {
        const pct =
          ((scene.endTimeMs - scene.startTimeMs) / totalDurationMs) * 100;
        const isSelected = scene.id === selectedId;
        const showLabel = pct > 6;

        return (
          <button
            key={scene.id}
            onClick={() => onSelect(scene.id)}
            title={`Scene ${scene.sceneOrder} · ${((scene.endTimeMs - scene.startTimeMs) / 1000).toFixed(1)}s · ${scene.description.slice(0, 80)}`}
            style={{
              width: `${pct}%`,
              backgroundColor: isSelected ? "#171717" : sceneColor(i),
              minWidth: "4px",
            }}
            className="relative flex items-center justify-center transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {showLabel && (
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums select-none",
                  isSelected ? "text-white" : "text-neutral-600"
                )}
              >
                {scene.sceneOrder}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReferenceFramePicker
// ---------------------------------------------------------------------------

function ReferenceFramePicker({
  candidateFrames: frames,
  selectedFrame,
  color,
  onSelect,
}: {
  candidateFrames: number[];
  selectedFrame: number;
  color: string;
  onSelect: (frame: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {frames.map((frame) => {
        const isSelected = frame === selectedFrame;
        return (
          <button
            key={frame}
            onClick={() => onSelect(frame)}
            className={cn(
              "aspect-video rounded overflow-hidden border-2 transition-all focus-visible:outline-none",
              isSelected
                ? "border-neutral-900 ring-2 ring-neutral-900 ring-offset-1"
                : "border-neutral-100 hover:border-neutral-300"
            )}
          >
            {/* Mock thumbnail: colored placeholder with frame number */}
            <div
              className="w-full h-full relative flex items-end justify-end p-1"
              style={{ backgroundColor: color }}
            >
              {isSelected && (
                <div className="absolute inset-0 bg-black/10" />
              )}
              <span className="relative text-[9px] font-mono font-semibold text-neutral-600 bg-white/80 px-1 py-0.5 rounded leading-none">
                f{frame}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneDetailPanel
// ---------------------------------------------------------------------------

function SceneDetailPanel({
  scene,
  sceneIndex,
  isLast,
  isOnly,
  onUpdate,
  onSplit,
  onMerge,
  onRemove,
}: {
  scene: MockScene;
  sceneIndex: number;
  isLast: boolean;
  isOnly: boolean;
  onUpdate: (patch: Partial<MockScene>) => void;
  onSplit: () => void;
  onMerge: () => void;
  onRemove: () => void;
}) {
  const durationMs = scene.endTimeMs - scene.startTimeMs;
  const color = sceneColor(sceneIndex);

  // Local controlled inputs for frame boundaries (commit on blur/enter)
  const [startInput, setStartInput] = useState(String(scene.startFrame));
  const [endInput, setEndInput] = useState(String(scene.endFrame));

  // Re-sync inputs when the selected scene changes
  useEffect(() => {
    setStartInput(String(scene.startFrame));
    setEndInput(String(scene.endFrame));
  }, [scene.id, scene.startFrame, scene.endFrame]);

  function commitStart() {
    const val = parseInt(startInput, 10);
    if (!isNaN(val) && val >= 0 && val < scene.endFrame) {
      onUpdate({
        startFrame: val,
        startTimeMs: Math.round((val / 30) * 1000),
        boundarySource:
          scene.boundarySource === "user_created"
            ? "user_created"
            : "user_adjusted",
      });
    } else {
      setStartInput(String(scene.startFrame));
    }
  }

  function commitEnd() {
    const val = parseInt(endInput, 10);
    if (!isNaN(val) && val > scene.startFrame) {
      onUpdate({
        endFrame: val,
        endTimeMs: Math.round((val / 30) * 1000),
        boundarySource:
          scene.boundarySource === "user_created"
            ? "user_created"
            : "user_adjusted",
      });
    } else {
      setEndInput(String(scene.endFrame));
    }
  }

  return (
    <div className="p-6 space-y-7">
      {/* Scene number + badge row */}
      <div className="flex items-start justify-between">
        <div className="flex items-end gap-3">
          <span className="text-8xl font-light leading-none text-neutral-200 tabular-nums select-none">
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span className="text-sm text-neutral-400 mb-2">
            {(durationMs / 1000).toFixed(1)}s &middot; f{scene.startFrame}–f
            {scene.endFrame}
          </span>
        </div>
        <div className="mt-1">
          <BoundaryBadge source={scene.boundarySource} />
        </div>
      </div>

      {/* Reference frame picker */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Reference Frame
        </p>
        <ReferenceFramePicker
          candidateFrames={scene.candidateFrames}
          selectedFrame={scene.referenceFrame}
          color={color}
          onSelect={(frame) =>
            onUpdate({ referenceFrame: frame, referenceFrameSource: "user_selected" })
          }
        />
        <p className="text-xs text-neutral-400 mt-2">
          Selected:{" "}
          <span className="font-mono font-medium text-neutral-600">
            f{scene.referenceFrame}
          </span>
          {scene.referenceFrameSource === "user_selected" && (
            <span className="ml-2 text-amber-600">· user selected</span>
          )}
        </p>
      </div>

      {/* Boundary inputs */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Boundaries
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">Start Frame</Label>
            <Input
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={commitStart}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitStart();
                if (e.key === "Escape") setStartInput(String(scene.startFrame));
              }}
              className="font-mono text-sm h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-500">End Frame</Label>
            <Input
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={commitEnd}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEnd();
                if (e.key === "Escape") setEndInput(String(scene.endFrame));
              }}
              className="font-mono text-sm h-9"
            />
          </div>
        </div>
        {scene.boundarySource !== "ai" && (
          <p className="text-xs text-amber-600 mt-1.5">
            Boundaries manually {scene.boundarySource === "user_created" ? "set" : "adjusted"}
          </p>
        )}
      </div>

      {/* Description textarea */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
          Description
        </p>
        <textarea
          value={scene.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={4}
          className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 transition-all placeholder:text-neutral-400"
          placeholder="Describe what happens in this scene…"
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
        <Button
          variant="outline"
          size="sm"
          onClick={onSplit}
          className="gap-1.5 text-xs h-8"
        >
          <Scissors className="h-3.5 w-3.5" />
          Split
        </Button>
        {!isLast && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMerge}
            className="gap-1.5 text-xs h-8"
          >
            <Layers className="h-3.5 w-3.5" />
            Merge with next
          </Button>
        )}
        {!isOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="gap-1.5 text-xs h-8 text-red-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneListItem
// ---------------------------------------------------------------------------

function SceneListItem({
  scene,
  sceneIndex,
  isSelected,
  onSelect,
  ref,
}: {
  scene: MockScene;
  sceneIndex: number;
  isSelected: boolean;
  onSelect: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const durationMs = scene.endTimeMs - scene.startTimeMs;
  const color = sceneColor(sceneIndex);

  return (
    <button
      ref={ref}
      onClick={onSelect}
      className={cn(
        "w-full text-left flex items-start gap-3 px-5 py-4 border-b border-neutral-100 transition-colors",
        isSelected ? "bg-neutral-900" : "hover:bg-neutral-50"
      )}
    >
      {/* Color swatch accent + scene number */}
      <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
        <div
          className="w-2 h-2 rounded-full mt-1"
          style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.3)" : color }}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Scene number + duration row */}
        <div className="flex items-baseline gap-2 mb-1">
          <span
            className={cn(
              "text-xl font-light tabular-nums leading-none",
              isSelected ? "text-white/30" : "text-neutral-200"
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
            {(durationMs / 1000).toFixed(1)}s
          </span>
          {scene.boundarySource !== "ai" && (
            <span
              className={cn(
                "text-[10px] font-medium",
                isSelected ? "text-amber-300" : "text-amber-600"
              )}
            >
              {scene.boundarySource === "user_adjusted" ? "Adjusted" : "Created"}
            </span>
          )}
        </div>

        {/* Description */}
        <p
          className={cn(
            "text-xs leading-relaxed line-clamp-2",
            isSelected ? "text-white/80" : "text-neutral-600"
          )}
        >
          {scene.description}
        </p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// ManifestPage (main)
// ---------------------------------------------------------------------------

export default function ManifestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [scenes, setScenes] = useState<MockScene[]>(MOCK_SCENES);
  const [selectedId, setSelectedId] = useState<string>(MOCK_SCENES[0].id);
  const [approveOpen, setApproveOpen] = useState(false);

  // Ref map for scrolling the scene list
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const selectedIndex = scenes.findIndex((s) => s.id === selectedId);
  const selectedScene = scenes[selectedIndex] ?? scenes[0];
  const totalDurationMs =
    scenes[scenes.length - 1]?.endTimeMs ?? MOCK_TOTAL_DURATION_MS;

  // Select a scene and scroll it into view in the list
  const selectScene = useCallback((id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      itemRefs.current[id]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }, []);

  // ---- Scene mutations (local state only) --------------------------------

  function updateScene(id: string, patch: Partial<MockScene>) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function splitScene(id: string) {
    const idx = scenes.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const scene = scenes[idx];
    const midFrame = Math.floor((scene.startFrame + scene.endFrame) / 2);
    const midTimeMs = Math.round((scene.startTimeMs + scene.endTimeMs) / 2);

    const newA: MockScene = {
      ...scene,
      endFrame: midFrame,
      endTimeMs: midTimeMs,
      candidateFrames: candidateFrames(scene.startFrame, midFrame),
      referenceFrame: Math.floor((scene.startFrame + midFrame) / 2),
      targetClipDurationS: parseFloat(
        ((midTimeMs - scene.startTimeMs) / 1000).toFixed(1)
      ),
    };
    const newB: MockScene = {
      ...scene,
      id: `${id}-b-${Date.now()}`,
      startFrame: midFrame,
      startTimeMs: midTimeMs,
      candidateFrames: candidateFrames(midFrame, scene.endFrame),
      referenceFrame: Math.floor((midFrame + scene.endFrame) / 2),
      boundarySource: "user_created",
      referenceFrameSource: "auto",
      description: scene.description,
      targetClipDurationS: parseFloat(
        ((scene.endTimeMs - midTimeMs) / 1000).toFixed(1)
      ),
    };

    const updated = [
      ...scenes.slice(0, idx),
      newA,
      newB,
      ...scenes.slice(idx + 1),
    ].map((s, i) => ({ ...s, sceneOrder: i + 1 }));

    setScenes(updated);
    // Stay on the first half
    setSelectedId(newA.id);
  }

  function mergeScene(id: string) {
    const idx = scenes.findIndex((s) => s.id === id);
    if (idx === -1 || idx >= scenes.length - 1) return;
    const a = scenes[idx];
    const b = scenes[idx + 1];

    const merged: MockScene = {
      ...a,
      endFrame: b.endFrame,
      endTimeMs: b.endTimeMs,
      candidateFrames: candidateFrames(a.startFrame, b.endFrame),
      description: a.description + " — " + b.description,
      targetClipDurationS: parseFloat(
        ((b.endTimeMs - a.startTimeMs) / 1000).toFixed(1)
      ),
    };

    const updated = [
      ...scenes.slice(0, idx),
      merged,
      ...scenes.slice(idx + 2),
    ].map((s, i) => ({ ...s, sceneOrder: i + 1 }));

    setScenes(updated);
    setSelectedId(merged.id);
  }

  function removeScene(id: string) {
    if (scenes.length <= 1) return;
    const idx = scenes.findIndex((s) => s.id === id);
    const updated = scenes
      .filter((s) => s.id !== id)
      .map((s, i) => ({ ...s, sceneOrder: i + 1 }));
    setScenes(updated);
    const nextSelected = updated[Math.min(idx, updated.length - 1)];
    setSelectedId(nextSelected.id);
  }

  // ---- Approve manifest --------------------------------------------------

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "producing" }),
      });
      if (!res.ok) throw new Error("Failed to approve manifest");
      return res.json();
    },
    onSuccess: (updated) => {
      qc.setQueryData(["project", id], updated);
      setApproveOpen(false);
      router.push(`/projects/${id}/production`);
    },
    onError: () => toast.error("Failed to approve manifest"),
  });

  // -----------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-neutral-200">
        <div>
          <h1 className="text-base font-semibold text-neutral-900">
            Scene Manifest
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            {scenes.length} scenes &middot;{" "}
            {msToTimecode(totalDurationMs)} total
          </p>
        </div>
        <Button
          onClick={() => setApproveOpen(true)}
          className="bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
        >
          <Check className="h-4 w-4" />
          Approve Manifest
        </Button>
      </div>

      {/* ── Timeline ── */}
      <div className="shrink-0 px-8 py-4 border-b border-neutral-100 bg-neutral-50/50">
        <ManifestTimeline
          scenes={scenes}
          selectedId={selectedId}
          onSelect={selectScene}
          totalDurationMs={totalDurationMs}
        />
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-neutral-400 font-mono">
          <span>0:00</span>
          {/* Timecodes at 25% intervals */}
          <span>{msToTimecode(totalDurationMs * 0.25)}</span>
          <span>{msToTimecode(totalDurationMs * 0.5)}</span>
          <span>{msToTimecode(totalDurationMs * 0.75)}</span>
          <span>{msToTimecode(totalDurationMs)}</span>
        </div>
      </div>

      {/* ── Content row ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Scene list (left, ~38%) */}
        <div
          ref={listRef}
          className="w-[38%] shrink-0 border-r border-neutral-200 overflow-y-auto"
        >
          {scenes.map((scene, i) => (
            <SceneListItem
              key={scene.id}
              scene={scene}
              sceneIndex={i}
              isSelected={scene.id === selectedId}
              onSelect={() => selectScene(scene.id)}
              ref={(el) => {
                itemRefs.current[scene.id] = el;
              }}
            />
          ))}
        </div>

        {/* Detail panel (right, ~62%) */}
        <div className="flex-1 overflow-y-auto bg-white">
          {selectedScene && (
            <SceneDetailPanel
              key={selectedScene.id}
              scene={selectedScene}
              sceneIndex={selectedIndex}
              isLast={selectedIndex === scenes.length - 1}
              isOnly={scenes.length === 1}
              onUpdate={(patch) => updateScene(selectedScene.id, patch)}
              onSplit={() => splitScene(selectedScene.id)}
              onMerge={() => mergeScene(selectedScene.id)}
              onRemove={() => removeScene(selectedScene.id)}
            />
          )}
        </div>
      </div>

      {/* ── Approve dialog ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve scene manifest?</DialogTitle>
            <DialogDescription>
              This locks the {scenes.length} scene boundaries and advances the
              project to Production. You won&apos;t be able to edit the manifest
              after approving.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveOpen(false)}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-neutral-900 hover:bg-neutral-700 text-white"
            >
              {approveMutation.isPending
                ? "Approving…"
                : "Approve & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
