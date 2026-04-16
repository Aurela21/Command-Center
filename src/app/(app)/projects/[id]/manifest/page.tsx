"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Loader2,
  Trash2,
  Sparkles,
  Pencil,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  SCENE_COLORS,
  candidateFrames,
  type MockScene,
} from "./mock-data";
import type { Project } from "@/db/schema";

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

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

/** Build a public R2 URL for an extracted frame. Frames are uploaded at 1fps. */
function frameUrl(projectId: string, secondIndex: number): string {
  return `${R2_PUBLIC}/frames/${projectId}/f${String(secondIndex).padStart(4, "0")}.jpg`;
}

// Map a DB scene row to the MockScene shape used by the UI
function dbSceneToMock(
  s: {
    id: string;
    sceneOrder: number;
    startFrame: number;
    endFrame: number;
    startTimeMs: number;
    endTimeMs: number;
    referenceFrame: number;
    referenceFrameUrl: string | null;
    referenceFrameSource: string | null;
    boundarySource: string | null;
    description: string | null;
    targetClipDurationS: number | null;
  },
  projectId: string
): MockScene {
  // One candidate per extracted frame (1fps) within the scene boundaries
  const cFrameNums = candidateFrames(s.startFrame, s.endFrame);
  const cUrls = cFrameNums.map((f) => frameUrl(projectId, Math.round(f / 30)));

  return {
    id: s.id,
    sceneOrder: s.sceneOrder,
    startFrame: s.startFrame,
    endFrame: s.endFrame,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    referenceFrame: s.referenceFrame,
    referenceFrameUrl: s.referenceFrameUrl ?? undefined,
    candidateFrames: cFrameNums,
    candidateFrameUrls: cUrls,
    referenceFrameSource: (s.referenceFrameSource ?? "auto") as "auto" | "user_selected",
    boundarySource: (s.boundarySource ?? "ai") as "ai" | "user_adjusted" | "user_created",
    description: s.description ?? "",
    targetClipDurationS: s.targetClipDurationS ?? 5,
  };
}

// ---------------------------------------------------------------------------
// BoundaryBadge
// ---------------------------------------------------------------------------

function BoundaryBadge({ source }: { source: MockScene["boundarySource"] }) {
  if (source === "ai") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <Sparkles className="h-3 w-3" />
        AI
      </span>
    );
  }
  if (source === "user_adjusted") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
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
    <div className="flex h-10 rounded-lg overflow-hidden gap-px bg-[#27272a]">
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
            className="relative flex items-center justify-center transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]"
          >
            {showLabel && (
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums select-none",
                  isSelected ? "text-white" : "text-[#a1a1aa]"
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
  candidateFrameUrls,
  selectedFrame,
  color,
  onSelect,
}: {
  candidateFrames: number[];
  candidateFrameUrls?: string[];
  selectedFrame: number;
  color: string;
  onSelect: (frame: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2 max-h-80 overflow-y-auto">
      {frames.map((frame, i) => {
        const isSelected = frame === selectedFrame;
        const imgUrl = candidateFrameUrls?.[i];
        return (
          <button
            key={frame}
            onClick={() => onSelect(frame)}
            className={cn(
              "aspect-[9/16] rounded overflow-hidden border-2 transition-all focus-visible:outline-none",
              isSelected
                ? "border-[#6366f1] ring-2 ring-[#6366f1] ring-offset-1"
                : "border-[#1a1a1e] hover:border-[#3f3f46]"
            )}
          >
            <div
              className="w-full h-full relative flex items-end justify-end p-1"
              style={{ backgroundColor: imgUrl ? undefined : color }}
            >
              {imgUrl && (
                <img
                  src={imgUrl}
                  alt={`Frame ${frame}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              {isSelected && (
                <div className="absolute inset-0 bg-black/10" />
              )}
              <span className="relative text-[9px] font-mono font-semibold text-[#a1a1aa] bg-black/60 px-1 py-0.5 rounded leading-none">
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

  const [startInput, setStartInput] = useState(String(scene.startFrame));
  const [endInput, setEndInput] = useState(String(scene.endFrame));

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
          scene.boundarySource === "user_created" ? "user_created" : "user_adjusted",
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
          scene.boundarySource === "user_created" ? "user_created" : "user_adjusted",
      });
    } else {
      setEndInput(String(scene.endFrame));
    }
  }

  return (
    <div className="p-6 space-y-7">
      <div className="flex items-start justify-between">
        <div className="flex items-end gap-3">
          <span className="text-8xl font-light leading-none text-[#27272a] tabular-nums select-none">
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span className="text-sm text-[#71717a] mb-2">
            {(durationMs / 1000).toFixed(1)}s &middot; f{scene.startFrame}–f{scene.endFrame}
          </span>
        </div>
        <div className="mt-1">
          <BoundaryBadge source={scene.boundarySource} />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-3">
          Reference Frame
        </p>
        {scene.referenceFrameUrl && (
          <div className="mb-3">
            <img
              src={scene.referenceFrameUrl}
              alt="Reference frame"
              className="w-full max-w-xs rounded-lg border border-[#1a1a1e] object-cover aspect-[9/16]"
            />
          </div>
        )}
        <ReferenceFramePicker
          candidateFrames={scene.candidateFrames}
          candidateFrameUrls={scene.candidateFrameUrls}
          selectedFrame={scene.referenceFrame}
          color={color}
          onSelect={(frame) =>
            onUpdate({ referenceFrame: frame, referenceFrameSource: "user_selected" })
          }
        />
        <p className="text-xs text-[#71717a] mt-2">
          Selected:{" "}
          <span className="font-mono font-medium text-[#a1a1aa]">
            f{scene.referenceFrame}
          </span>
          {scene.referenceFrameSource === "user_selected" && (
            <span className="ml-2 text-amber-600">· user selected</span>
          )}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-3">
          Boundaries
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-[#a1a1aa]">Start Frame</Label>
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
            <Label className="text-xs text-[#a1a1aa]">End Frame</Label>
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

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-3">
          Description
        </p>
        <textarea
          value={scene.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={4}
          className="w-full text-sm rounded-md border border-[#27272a] px-3 py-2.5 bg-[#18181b] resize-none focus:outline-none focus:ring-2 focus:ring-[#27272a] focus:border-[#3f3f46] transition-all placeholder:text-[#71717a] text-[#fafafa]"
          placeholder="Describe what happens in this scene…"
        />
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-[#1a1a1e]">
        <Button variant="outline" size="sm" onClick={onSplit} className="gap-1.5 text-xs h-8">
          <Scissors className="h-3.5 w-3.5" />
          Split
        </Button>
        {!isLast && (
          <Button variant="outline" size="sm" onClick={onMerge} className="gap-1.5 text-xs h-8">
            <Layers className="h-3.5 w-3.5" />
            Merge with next
          </Button>
        )}
        {!isOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRemove}
            className="gap-1.5 text-xs h-8 text-red-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 ml-auto"
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
        "w-full text-left flex items-start gap-3 px-5 py-4 border-b border-[#1a1a1e] transition-colors",
        isSelected ? "bg-[#6366f1]" : "hover:bg-[#27272a]"
      )}
    >
      <div className="shrink-0 flex flex-col items-center gap-1.5 pt-0.5">
        <div
          className="w-2 h-2 rounded-full mt-1"
          style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.3)" : color }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={cn("text-xl font-light tabular-nums leading-none", isSelected ? "text-white/30" : "text-[#27272a]")}>
            {String(scene.sceneOrder).padStart(2, "0")}
          </span>
          <span className={cn("text-xs tabular-nums", isSelected ? "text-white/40" : "text-[#71717a]")}>
            {(durationMs / 1000).toFixed(1)}s
          </span>
          {scene.boundarySource !== "ai" && (
            <span className={cn("text-[10px] font-medium", isSelected ? "text-amber-300" : "text-amber-600")}>
              {scene.boundarySource === "user_adjusted" ? "Adjusted" : "Created"}
            </span>
          )}
        </div>
        <p className={cn("text-xs leading-relaxed line-clamp-2", isSelected ? "text-white/80" : "text-[#a1a1aa]")}>
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

  const [scenes, setScenes] = useState<MockScene[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [approveOpen, setApproveOpen] = useState(false);

  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);

  // ── Fetch project status ──────────────────────────────────────────────────
  const { data: project } = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to load project");
      return res.json();
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "analyzing" ? 3000 : false;
    },
  });

  // ── Fetch scenes ──────────────────────────────────────────────────────────
  const { data: dbScenes, isLoading: scenesLoading } = useQuery({
    queryKey: ["scenes", id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/scenes`);
      if (!res.ok) throw new Error("Failed to load scenes");
      return res.json() as Promise<Parameters<typeof dbSceneToMock>[0][]>; // first param only
    },
    refetchInterval: (query) => {
      // Keep polling while we have no scenes and project is still analyzing
      return query.state.data?.length === 0 ? 3000 : false;
    },
  });

  // Sync DB scenes into local state
  useEffect(() => {
    if (dbScenes && dbScenes.length > 0) {
      const mapped = dbScenes.map((s) => dbSceneToMock(s, id));
      setScenes(mapped);
      if (!selectedId || !mapped.find((s) => s.id === selectedId)) {
        setSelectedId(mapped[0].id);
      }
    }
  }, [dbScenes]);

  const selectedIndex = scenes.findIndex((s) => s.id === selectedId);
  const selectedScene = scenes[selectedIndex] ?? scenes[0];
  const totalDurationMs = scenes[scenes.length - 1]?.endTimeMs ?? 0;
  const isAnalyzing = project?.status === "analyzing" || (project?.status === "manifest_review" && scenesLoading);

  const selectScene = useCallback((id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => {
      itemRefs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  // ── Scene mutations (local state only — saved to DB on approve) ───────────

  function updateScene(sceneId: string, patch: Partial<MockScene>) {
    setScenes((prev) =>
      prev.map((s) => {
        if (s.id !== sceneId) return s;
        const updated = { ...s, ...patch };
        // Recompute candidate frames when boundaries change
        if (patch.startFrame !== undefined || patch.endFrame !== undefined) {
          const cFrameNums = candidateFrames(updated.startFrame, updated.endFrame);
          const cUrls = cFrameNums.map((f) => frameUrl(id, Math.round(f / 30)));
          updated.candidateFrames = cFrameNums;
          updated.candidateFrameUrls = cUrls;
        }
        return updated;
      })
    );
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
      targetClipDurationS: parseFloat(((midTimeMs - scene.startTimeMs) / 1000).toFixed(1)),
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
      targetClipDurationS: parseFloat(((scene.endTimeMs - midTimeMs) / 1000).toFixed(1)),
    };

    const updated = [...scenes.slice(0, idx), newA, newB, ...scenes.slice(idx + 1)].map(
      (s, i) => ({ ...s, sceneOrder: i + 1 })
    );
    setScenes(updated);
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
      targetClipDurationS: parseFloat(((b.endTimeMs - a.startTimeMs) / 1000).toFixed(1)),
    };

    const updated = [...scenes.slice(0, idx), merged, ...scenes.slice(idx + 2)].map(
      (s, i) => ({ ...s, sceneOrder: i + 1 })
    );
    setScenes(updated);
    setSelectedId(merged.id);
  }

  function removeScene(id: string) {
    if (scenes.length <= 1) return;
    const idx = scenes.findIndex((s) => s.id === id);
    const updated = scenes.filter((s) => s.id !== id).map((s, i) => ({ ...s, sceneOrder: i + 1 }));
    setScenes(updated);
    const nextSelected = updated[Math.min(idx, updated.length - 1)];
    setSelectedId(nextSelected.id);
  }

  // ── Approve manifest ──────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: async () => {
      // 1. Save the final scene state to DB (replace existing)
      const scenePayload = scenes.map((s) => ({
        sceneOrder: s.sceneOrder,
        startFrame: s.startFrame,
        endFrame: s.endFrame,
        startTimeMs: s.startTimeMs,
        endTimeMs: s.endTimeMs,
        referenceFrame: s.referenceFrame,
        referenceFrameSource: s.referenceFrameSource,
        boundarySource: s.boundarySource,
        description: s.description,
        targetClipDurationS: s.targetClipDurationS,
      }));

      const scenesRes = await fetch(`/api/projects/${id}/scenes?replace=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenePayload),
      });
      if (!scenesRes.ok) throw new Error("Failed to save scenes");

      // 2. Advance project status
      const projectRes = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "producing" }),
      });
      if (!projectRes.ok) throw new Error("Failed to approve manifest");
      return projectRes.json();
    },
    onSuccess: (updated) => {
      qc.setQueryData(["project", id], updated);
      setApproveOpen(false);
      router.push(`/projects/${id}/production`);
    },
    onError: () => toast.error("Failed to approve manifest"),
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (isAnalyzing || (scenesLoading && scenes.length === 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#18181b] gap-4">
        <Loader2 className="h-8 w-8 text-[#52525b] animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium text-[#a1a1aa]">Analyzing video…</p>
          <p className="text-xs text-[#71717a] mt-1">
            Claude is detecting scenes. This takes 30–60 seconds.
          </p>
        </div>
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#18181b]">
        <p className="text-sm text-[#71717a]">No scenes found. Try re-uploading the video.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#18181b]">
      {/* ── Header ── */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-b border-[#27272a]">
        <div>
          <h1 className="text-base font-semibold text-[#fafafa]">Scene Manifest</h1>
          <p className="text-xs text-[#71717a] mt-0.5">
            {scenes.length} scenes &middot; {msToTimecode(totalDurationMs)} total
          </p>
        </div>
        <Button
          onClick={() => setApproveOpen(true)}
          className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-2"
        >
          <Check className="h-4 w-4" />
          Approve Manifest
        </Button>
      </div>

      {/* ── Timeline ── */}
      <div className="shrink-0 px-8 py-4 border-b border-[#1a1a1e] bg-[#09090b]/50">
        <ManifestTimeline
          scenes={scenes}
          selectedId={selectedId}
          onSelect={selectScene}
          totalDurationMs={totalDurationMs}
        />
        <div className="flex items-center justify-between mt-1.5 text-[11px] text-[#71717a] font-mono">
          <span>0:00</span>
          <span>{msToTimecode(totalDurationMs * 0.25)}</span>
          <span>{msToTimecode(totalDurationMs * 0.5)}</span>
          <span>{msToTimecode(totalDurationMs * 0.75)}</span>
          <span>{msToTimecode(totalDurationMs)}</span>
        </div>
      </div>

      {/* ── Content row ── */}
      <div className="flex-1 flex overflow-hidden">
        <div ref={listRef} className="w-[38%] shrink-0 border-r border-[#27272a] overflow-y-auto">
          {scenes.map((scene, i) => (
            <SceneListItem
              key={scene.id}
              scene={scene}
              sceneIndex={i}
              isSelected={scene.id === selectedId}
              onSelect={() => selectScene(scene.id)}
              ref={(el) => { itemRefs.current[scene.id] = el; }}
            />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto bg-[#18181b]">
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
              className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white"
            >
              {approveMutation.isPending ? "Approving…" : "Approve & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
