"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Image as ImageIcon, Loader2, Video, X, Sparkles, AlertTriangle } from "lucide-react";
import type { SceneProductionState } from "./types";

// ─── Types ───────────────────────────────────────────────────────────────────

type TrackedJob = {
  id: string;
  label: string;
  type: "seed" | "video" | "hero";
  status: "active" | "queued" | "completed" | "failed";
  progress: number; // 0-100
  startedAt: number; // Date.now()
  completedAt?: number;
  error?: string;
};

// ─── Simulated progress curve ────────────────────────────────────────────────

function simulatedProgress(elapsedS: number): number {
  if (elapsedS < 5) return (elapsedS / 5) * 30;
  return 30 + (1 - Math.exp(-(elapsedS - 5) / 15)) * 65;
}

// ─── Job row ─────────────────────────────────────────────────────────────────

function JobRow({ job }: { job: TrackedJob }) {
  const colors = {
    seed: { bg: "bg-amber-500", track: "bg-amber-100", text: "text-amber-600", icon: "text-amber-500" },
    video: { bg: "bg-blue-500", track: "bg-blue-100", text: "text-blue-600", icon: "text-blue-500" },
    hero: { bg: "bg-violet-500", track: "bg-violet-100", text: "text-violet-600", icon: "text-violet-500" },
  }[job.type];

  const Icon = job.type === "seed" ? ImageIcon : job.type === "video" ? Video : Sparkles;

  const isComplete = job.status === "completed";
  const isFailed = job.status === "failed";
  const isQueued = job.status === "queued";
  const ago = isComplete && job.completedAt
    ? `${Math.round((Date.now() - job.completedAt) / 1000)}s ago`
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 transition-opacity",
        isComplete && "opacity-50",
        isFailed && "opacity-80"
      )}
    >
      {/* Icon */}
      <div className="shrink-0">
        {isComplete ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : isFailed ? (
          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
        ) : isQueued ? (
          <div className={cn("h-3.5 w-3.5 rounded-full border-2", `border-neutral-300`)} />
        ) : (
          <Loader2 className={cn("h-3.5 w-3.5 animate-spin", colors.icon)} />
        )}
      </div>

      {/* Label */}
      <div className="w-40 shrink-0">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-700 truncate">{job.label}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex-1 min-w-0">
        <div className={cn("h-2 rounded-full overflow-hidden", isFailed ? "bg-red-100" : colors.track)}>
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isFailed ? "bg-red-500" : colors.bg
            )}
            style={{ width: `${isFailed ? 100 : job.progress}%` }}
          />
        </div>
      </div>

      {/* Status text */}
      <div className="w-20 shrink-0 text-right">
        {isFailed ? (
          <span className="text-[11px] font-medium text-red-500">Failed</span>
        ) : isComplete ? (
          <span className="text-[11px] text-neutral-400">{ago ?? "Done"}</span>
        ) : isQueued ? (
          <span className="text-[11px] text-neutral-400">Queued</span>
        ) : (
          <span className={cn("text-[11px] font-medium tabular-nums", colors.text)}>
            {Math.round(job.progress)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Queue Tracker ───────────────────────────────────────────────────────────

type Props = {
  scenes: SceneProductionState[];
  heroGenerating: boolean;
};

export function QueueTracker({ scenes, heroGenerating }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [completedJobs, setCompletedJobs] = useState<TrackedJob[]>([]);
  const prevScenesRef = useRef<SceneProductionState[]>([]);
  const prevHeroRef = useRef(false);
  const [tick, setTick] = useState(0);

  // Track start times for simulated progress
  const seedStartTimes = useRef<Record<string, number>>({});
  const heroStartTime = useRef<number | null>(null);

  // Tick every 500ms for simulated progress animation
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(timer);
  }, []);

  // Track seed generation start times
  useEffect(() => {
    for (const scene of scenes) {
      if (scene.seedGenerating && !seedStartTimes.current[scene.sceneId]) {
        seedStartTimes.current[scene.sceneId] = Date.now();
      }
      if (!scene.seedGenerating && seedStartTimes.current[scene.sceneId]) {
        delete seedStartTimes.current[scene.sceneId];
      }
    }
  }, [scenes]);

  // Track hero generation start time
  useEffect(() => {
    if (heroGenerating && !heroStartTime.current) {
      heroStartTime.current = Date.now();
    }
    if (!heroGenerating && heroStartTime.current) {
      heroStartTime.current = null;
    }
  }, [heroGenerating]);

  // Detect completions and failures — add to completed list
  useEffect(() => {
    const prev = prevScenesRef.current;
    for (const scene of scenes) {
      const prevScene = prev.find((s) => s.sceneId === scene.sceneId);
      if (!prevScene) continue;

      // Seed completed
      if (prevScene.seedGenerating && !scene.seedGenerating) {
        const done: TrackedJob = { id: `seed-${scene.sceneId}-${Date.now()}`, label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Seed`, type: "seed", status: "completed", progress: 100, startedAt: Date.now(), completedAt: Date.now() };
        setCompletedJobs((cj) => [done, ...cj].slice(0, 5));
      }

      // Video completed
      if (prevScene.videoJobStatus === "processing" && scene.videoJobStatus === "completed") {
        const done: TrackedJob = { id: `video-${scene.sceneId}-${Date.now()}`, label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Video`, type: "video", status: "completed", progress: 100, startedAt: Date.now(), completedAt: Date.now() };
        setCompletedJobs((cj) => [done, ...cj].slice(0, 5));
      }

      // Video failed
      if (prevScene.videoJobStatus !== "failed" && scene.videoJobStatus === "failed") {
        const fail: TrackedJob = { id: `video-fail-${scene.sceneId}-${Date.now()}`, label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Video`, type: "video", status: "failed", progress: 0, startedAt: Date.now(), error: scene.videoJobError };
        setCompletedJobs((cj) => [fail, ...cj].slice(0, 5));
      }
    }

    // Hero completed
    if (prevHeroRef.current && !heroGenerating) {
      const done: TrackedJob = { id: `hero-${Date.now()}`, label: "Hero Model", type: "hero", status: "completed", progress: 100, startedAt: Date.now(), completedAt: Date.now() };
      setCompletedJobs((cj) => [done, ...cj].slice(0, 5));
    }

    prevScenesRef.current = scenes;
    prevHeroRef.current = heroGenerating;
  }, [scenes, heroGenerating]);

  // Auto-remove completed jobs after 60s
  useEffect(() => {
    const timer = setInterval(() => {
      setCompletedJobs((cj) =>
        cj.filter((j) => {
          if (j.status === "failed") return true; // keep failed forever
          return j.completedAt && Date.now() - j.completedAt < 60000;
        })
      );
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Build active jobs list
  const activeJobs: TrackedJob[] = [];

  // Seeds
  for (const scene of scenes) {
    if (scene.seedGenerating) {
      const start = seedStartTimes.current[scene.sceneId] ?? Date.now();
      const elapsed = (Date.now() - start) / 1000;
      activeJobs.push({
        id: `seed-${scene.sceneId}`,
        label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Seed`,
        type: "seed",
        status: "active",
        progress: Math.min(95, simulatedProgress(elapsed)),
        startedAt: start,
      });
    }
  }

  // Videos
  for (const scene of scenes) {
    if (scene.videoJobStatus === "queued") {
      activeJobs.push({
        id: `video-${scene.sceneId}`,
        label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Video`,
        type: "video",
        status: "queued",
        progress: 0,
        startedAt: Date.now(),
      });
    } else if (scene.videoJobStatus === "processing") {
      activeJobs.push({
        id: `video-${scene.sceneId}`,
        label: `Scene ${String(scene.sceneOrder).padStart(2, "0")} — Video`,
        type: "video",
        status: "active",
        progress: scene.videoJobProgress,
        startedAt: Date.now(),
      });
    }
  }

  // Hero
  if (heroGenerating) {
    const start = heroStartTime.current ?? Date.now();
    const elapsed = (Date.now() - start) / 1000;
    activeJobs.push({
      id: "hero",
      label: "Hero Model",
      type: "hero",
      status: "active",
      progress: Math.min(95, simulatedProgress(elapsed)),
      startedAt: start,
    });
  }

  const allJobs = [...activeJobs, ...completedJobs];
  const activeCount = activeJobs.length;

  // Don't render if nothing to show
  if (allJobs.length === 0) return null;

  // Auto-expand when new active job appears
  useEffect(() => {
    if (activeCount > 0) setCollapsed(false);
  }, [activeCount]);

  return (
    <div className="fixed bottom-0 left-60 right-0 z-40 border-t border-neutral-200 bg-white shadow-lg">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={cn("h-2 w-2 rounded-full", activeCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-neutral-300")} />
          <span className="text-xs font-medium text-neutral-700">
            Queue
            {activeCount > 0 && <span className="text-neutral-400 font-normal ml-1">({activeCount} active)</span>}
            {completedJobs.length > 0 && activeCount === 0 && <span className="text-neutral-400 font-normal ml-1">({completedJobs.length} recent)</span>}
          </span>
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-400 transition-transform", collapsed && "rotate-180")} />
      </button>

      {/* Job list */}
      {!collapsed && (
        <div className="max-h-48 overflow-y-auto border-t border-neutral-100">
          {allJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
