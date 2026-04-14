"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SCENE_COLORS } from "../manifest/mock-data";
import type {
  SceneProductionState,
  SeedVersion,
  SSEEvent,
  ProductionTab,
} from "./types";
import { Tab3A } from "./tab-3a";
import { Tab3B } from "./tab-3b";
import { TabReview } from "./tab-review";
import { Tab3C } from "./tab-3c";
import { Loader2 } from "lucide-react";

// ─── DB row types (mirrors what production-state returns) ────────────────────

type DbScene = {
  id: string;
  sceneOrder: number;
  description: string | null;
  referenceFrame: number;
  referenceFrameUrl: string | null;
  startFrameUrl: string | null;
  targetClipDurationS: number | null;
  nanoBananaPrompt: string | null;
  scriptSegment: string | null;
  scenePrompt: string | null;
  approvedSeedImageId: string | null;
  seedImageApproved: boolean | null;
  klingPromptApproved: boolean | null;
  startTimeMs: number;
  endTimeMs: number;
};

type DbAssetVersion = {
  id: string;
  sceneId: string;
  assetType: string;
  fileUrl: string;
  versionNumber: number;
  isApproved: boolean | null;
  isRejected: boolean | null;
  rejectionReason: string | null;
  qualityScore: unknown;
  createdAt: string;
};

type DbJob = {
  id: string;
  sceneId: string | null;
  jobType: string;
  status: string;
  externalJobId: string | null;
  lastError: string | null;
  createdAt: string;
};

// ─── DB → SceneProductionState mapper ────────────────────────────────────────

const R2_PUBLIC = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";

function frameUrl(projectId: string, frameNumber: number): string {
  const sec = Math.round(frameNumber / 30);
  return `${R2_PUBLIC}/frames/${projectId}/f${String(sec).padStart(4, "0")}.jpg`;
}

function dbToState(
  scene: DbScene,
  assets: DbAssetVersion[],
  jobs: DbJob[],
  color: string,
  projectId: string
): SceneProductionState {
  const sceneAssets = assets.filter((a) => a.sceneId === scene.id);
  const seedAssets = sceneAssets.filter((a) => a.assetType === "seed_image");
  const klingAssets = sceneAssets.filter((a) => a.assetType === "kling_output");

  const seedVersions: SeedVersion[] = seedAssets.map((a) => {
    const qs = a.qualityScore;
    const score =
      qs !== null && typeof qs === "object" && "overall" in (qs as object)
        ? (qs as { overall: number }).overall
        : typeof qs === "number"
        ? qs
        : 0;
    return {
      id: a.id,
      createdAt: a.createdAt,
      qualityScore: score,
      color,
      imageUrl: a.fileUrl,
      isRejected: a.isRejected ?? false,
      rejectionReason: a.rejectionReason ?? undefined,
    };
  });

  const approvedSeed = seedAssets.find((a) => a.isApproved);

  // Kling jobs — sorted desc by createdAt (production-state orders desc)
  const klingJobs = jobs.filter(
    (j) => j.sceneId === scene.id && j.jobType === "kling_generation"
  );
  const latestKling = klingJobs[0];

  let videoJobStatus: SceneProductionState["videoJobStatus"] = "idle";
  let videoJobProgress = 0;
  let videoJobError: string | undefined;
  let videoJobId: string | undefined;
  let videoUrl: string | undefined;

  // Only treat a kling job as active if it's recent (last 5 min) or already submitted to API
  const klingIsActive =
    latestKling &&
    (latestKling.status === "completed" ||
      latestKling.status === "failed" ||
      latestKling.status === "processing" ||
      (["queued", "submitted", "retrying"].includes(latestKling.status) &&
        (latestKling.externalJobId != null ||
          new Date(latestKling.createdAt).getTime() > Date.now() - 5 * 60 * 1000)));

  if (klingIsActive && latestKling) {
    videoJobId = latestKling.id;
    const s = latestKling.status;
    if (s === "completed") {
      videoJobStatus = "completed";
      videoJobProgress = 100;
      videoUrl = klingAssets[0]?.fileUrl;
    } else if (s === "failed") {
      videoJobStatus = "failed";
      videoJobError = latestKling.lastError ?? undefined;
    } else if (s === "processing") {
      videoJobStatus = "processing";
    } else {
      videoJobStatus = "queued";
    }
  }

  // Detect in-progress nano_banana jobs — only jobs created in the last 5 minutes
  // so stale stuck jobs from failed attempts don't permanently block the UI
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const pendingSeed = jobs.find(
    (j) =>
      j.sceneId === scene.id &&
      j.jobType === "nano_banana" &&
      ["queued", "submitted", "processing"].includes(j.status) &&
      new Date(j.createdAt).getTime() > fiveMinutesAgo
  );

  return {
    sceneId: scene.id,
    sceneOrder: scene.sceneOrder,
    description: scene.description ?? "",
    referenceFrame: scene.referenceFrame,
    referenceFrameUrl: scene.referenceFrameUrl ?? frameUrl(projectId, scene.referenceFrame),
    targetClipDurationS: scene.targetClipDurationS ?? 5,
    color,
    nanoBananaPrompt: scene.nanoBananaPrompt ?? "",
    seedVersions,
    approvedSeedVersionId: approvedSeed?.id ?? null,
    seedImageApproved: scene.seedImageApproved ?? false,
    seedGenerating: !!pendingSeed,
    klingPrompt: scene.scriptSegment ?? scene.scenePrompt ?? "",
    klingPromptApproved: scene.klingPromptApproved ?? false,
    videoJobStatus,
    videoJobProgress,
    videoJobError,
    videoJobId,
    videoUrl,
  };
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: ProductionTab; label: string }[] = [
  { id: "3a", label: "3A — Seed Images" },
  { id: "3b", label: "3B — Script & Prompts" },
  { id: "review", label: "Review Pairs" },
  { id: "3c", label: "3C — Video Generation" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<ProductionTab>("3a");
  const [scenes, setScenes] = useState<SceneProductionState[]>([]);
  const [script, setScript] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<SceneProductionState>) => {
      setScenes((prev) =>
        prev.map((s) => (s.sceneId === sceneId ? { ...s, ...patch } : s))
      );
    },
    []
  );

  // Load initial production state
  useEffect(() => {
    fetch(`/api/projects/${projectId}/production-state`)
      .then((r) => r.json())
      .then(
        (data: {
          scenes: DbScene[];
          assetVersions: DbAssetVersion[];
          jobs: DbJob[];
        }) => {
          const mapped = data.scenes.map((s, i) =>
            dbToState(
              s,
              data.assetVersions,
              data.jobs,
              SCENE_COLORS[i % SCENE_COLORS.length],
              projectId
            )
          );
          setScenes(mapped);
          setLoading(false);
        }
      )
      .catch(() => setLoading(false));
  }, [projectId]);

  // SSE listener for live job updates
  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (e: MessageEvent) => {
      let event: SSEEvent;
      try {
        event = JSON.parse(e.data as string) as SSEEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "job:progress":
          if (event.sceneId) {
            updateScene(event.sceneId, {
              videoJobStatus: "processing",
              videoJobProgress: event.progress,
            });
          }
          break;

        case "job:completed":
          if (event.sceneId) {
            if (event.jobType === "nano_banana") {
              // Completed seed image — add to versions list
              if (event.assetVersionId) {
                setScenes((prev) =>
                  prev.map((s) => {
                    if (s.sceneId !== event.sceneId) return s;
                    const newVersion: SeedVersion = {
                      id: event.assetVersionId!,
                      createdAt: new Date().toISOString(),
                      qualityScore: 0,
                      color: s.color,
                      imageUrl: event.fileUrl ?? undefined,
                    };
                    return {
                      ...s,
                      seedVersions: [...s.seedVersions, newVersion],
                      seedGenerating: false,
                    };
                  })
                );
              } else {
                updateScene(event.sceneId, { seedGenerating: false });
              }
            } else if (event.jobType === "kling_generation") {
              const qs =
                event.qualityScore != null &&
                typeof event.qualityScore === "object"
                  ? (event.qualityScore as {
                      overall: number;
                      notes: string;
                      lipSyncRisk?: boolean;
                    })
                  : undefined;
              updateScene(event.sceneId, {
                videoJobStatus: "completed",
                videoJobProgress: 100,
                videoUrl: event.fileUrl ?? undefined,
                qualityScore: qs,
              });
            }
          }
          break;

        case "job:failed":
          if (event.sceneId) {
            updateScene(event.sceneId, {
              videoJobStatus: "failed",
              videoJobError: event.error,
              seedGenerating: false,
            });
          }
          break;

        case "job:retrying":
          if (event.sceneId) {
            updateScene(event.sceneId, {
              videoJobStatus: "queued",
              videoJobProgress: 0,
            });
          }
          break;
      }
    };

    return () => es.close();
  }, [updateScene]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const seedsApproved = scenes.filter((s) => s.seedImageApproved).length;
  const promptsApproved = scenes.filter((s) => s.klingPromptApproved).length;
  const videosComplete = scenes.filter(
    (s) => s.videoJobStatus === "completed"
  ).length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* ── Header ── */}
      <div className="shrink-0 px-8 py-4 border-b border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-base font-semibold text-neutral-900">
              Production
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              {scenes.length} scenes &middot; {seedsApproved}/{scenes.length}{" "}
              seeds &middot; {promptsApproved}/{scenes.length} prompts &middot;{" "}
              {videosComplete}/{scenes.length} videos
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "3a" && (
          <Tab3A
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
          />
        )}
        {activeTab === "3b" && (
          <Tab3B
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
            script={script}
            onScriptChange={setScript}
          />
        )}
        {activeTab === "review" && (
          <TabReview
            scenes={scenes}
            onGoTo3A={() => setActiveTab("3a")}
            onGoTo3B={() => setActiveTab("3b")}
          />
        )}
        {activeTab === "3c" && (
          <Tab3C
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}
