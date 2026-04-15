"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SCENE_COLORS } from "../manifest/mock-data";
import type {
  SceneProductionState,
  SeedVersion,
  VideoVersion,
  SSEEvent,
  ProductionTab,
  HeroImage,
} from "./types";
import { Tab3A, type ProductTag } from "./tab-3a";
import { Tab3B } from "./tab-3b";
import { TabReview } from "./tab-review";
import { Tab3C } from "./tab-3c";
import { QueueTracker } from "./queue-tracker";
import { ChatPanel } from "./chat-panel";
import { Brain, Loader2 } from "lucide-react";

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
  endFrameUrl: string | null;
  endFramePrompt: string | null;
  seedSkipped: boolean | null;
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
  generationPrompt: string | null;
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

  const videoVersions: VideoVersion[] = klingAssets.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    fileUrl: a.fileUrl,
    prompt: a.generationPrompt ?? undefined,
    isRejected: a.isRejected ?? false,
    rejectionReason: a.rejectionReason ?? undefined,
  }));

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
      prompt: a.generationPrompt ?? undefined,
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
    endFrameUrl: scene.endFrameUrl ?? null,
    endFramePrompt: scene.endFramePrompt ?? null,
    seedSkipped: scene.seedSkipped ?? false,
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
    videoVersions,
  };
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: ProductionTab; label: string }[] = [
  { id: "3b", label: "3A — Script & Motion" },
  { id: "3a", label: "3B — Seed Images" },
  { id: "review", label: "Review Pairs" },
  { id: "3c", label: "3C — Video Generation" },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<ProductionTab>("3b");
  const [scenes, setScenes] = useState<SceneProductionState[]>([]);
  const [script, setScript] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [extractedFrameCount, setExtractedFrameCount] = useState(0);
  const [r2PublicUrl, setR2PublicUrl] = useState("");
  const [projectType, setProjectType] = useState<"reference" | "concept">("reference");
  const [heroImages, setHeroImages] = useState<HeroImage[]>([]);
  const [approvedHeroUrl, setApprovedHeroUrl] = useState<string | null>(null);
  const [heroGenerating, setHeroGenerating] = useState(false);
  const [productTags, setProductTags] = useState<ProductTag[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<SceneProductionState>) => {
      setScenes((prev) =>
        prev.map((s) => (s.sceneId === sceneId ? { ...s, ...patch } : s))
      );

      // Auto-save persistable fields to DB (debounced)
      const dbPatch: Record<string, unknown> = {};
      if ("klingPrompt" in patch) dbPatch.scriptSegment = patch.klingPrompt;
      if ("klingPromptApproved" in patch) dbPatch.klingPromptApproved = patch.klingPromptApproved;
      if ("nanoBananaPrompt" in patch) dbPatch.nanoBananaPrompt = patch.nanoBananaPrompt;
      if ("seedImageApproved" in patch) dbPatch.seedImageApproved = patch.seedImageApproved;
      if ("approvedSeedVersionId" in patch) dbPatch.approvedSeedImageId = patch.approvedSeedVersionId;
      if ("referenceFrame" in patch) dbPatch.referenceFrame = patch.referenceFrame;
      if ("referenceFrameUrl" in patch) dbPatch.referenceFrameUrl = patch.referenceFrameUrl;
      if ("endFrameUrl" in patch) dbPatch.endFrameUrl = patch.endFrameUrl;
      if ("endFramePrompt" in patch) dbPatch.endFramePrompt = patch.endFramePrompt;
      if ("seedSkipped" in patch) dbPatch.seedSkipped = patch.seedSkipped;

      if (Object.keys(dbPatch).length > 0) {
        // Debounce — text fields get 500ms, booleans save immediately
        const hasText = "scriptSegment" in dbPatch || "nanoBananaPrompt" in dbPatch || "endFramePrompt" in dbPatch;
        const delay = hasText ? 500 : 0;

        if (saveTimers.current[sceneId]) clearTimeout(saveTimers.current[sceneId]);
        saveTimers.current[sceneId] = setTimeout(() => {
          fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dbPatch),
          }).catch(console.error);
        }, delay);
      }
    },
    [projectId]
  );

  const addScene = useCallback(async () => {
    const nextOrder = scenes.length + 1;
    const res = await fetch(`/api/projects/${projectId}/scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneOrder: nextOrder,
        startFrame: 0,
        endFrame: 0,
        startTimeMs: 0,
        endTimeMs: 0,
        referenceFrame: 0,
        description: "New scene",
        targetClipDurationS: 5,
      }),
    });
    if (!res.ok) return;
    const created = await res.json();
    const newScene: SceneProductionState = {
      sceneId: created.id,
      sceneOrder: nextOrder,
      description: created.description ?? "New scene",
      referenceFrame: 0,
      referenceFrameUrl: frameUrl(projectId, 0),
      targetClipDurationS: 5,
      color: SCENE_COLORS[(scenes.length) % SCENE_COLORS.length],
      nanoBananaPrompt: "",
      seedVersions: [],
      approvedSeedVersionId: null,
      seedImageApproved: false,
      seedSkipped: false,
      klingPrompt: "",
      klingPromptApproved: false,
      videoJobStatus: "idle",
      videoJobProgress: 0,
      videoVersions: [],
    };
    setScenes((prev) => [...prev, newScene]);
  }, [scenes.length, projectId]);

  const removeScene = useCallback(async (sceneId: string) => {
    const res = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setScenes((prev) => {
      const filtered = prev.filter((s) => s.sceneId !== sceneId);
      return filtered.map((s, i) => ({ ...s, sceneOrder: i + 1 }));
    });
  }, [projectId]);

  // Append a seed version using functional update (avoids stale closures)
  const addSeedVersion = useCallback(
    (sceneId: string, version: SeedVersion) => {
      setScenes((prev) =>
        prev.map((s) => {
          if (s.sceneId !== sceneId) return s;
          // Deduplicate by ID
          if (s.seedVersions.some((v) => v.id === version.id)) {
            return { ...s, seedGenerating: false };
          }
          return {
            ...s,
            seedGenerating: false,
            seedVersions: [...s.seedVersions, version],
          };
        })
      );
    },
    []
  );

  // Load product tags once
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ slug: string; name: string; imageCount?: number }>) =>
        setProductTags(data.map((p) => ({ slug: p.slug, name: p.name, imageCount: p.imageCount ?? 0 })))
      )
      .catch(() => {});
  }, []);

  // Load initial production state
  useEffect(() => {
    fetch(`/api/projects/${projectId}/production-state`)
      .then((r) => r.json())
      .then(
        (data: {
          scenes: DbScene[];
          assetVersions: DbAssetVersion[];
          jobs: DbJob[];
          extractedFrameCount: number;
          r2PublicUrl: string;
          projectType: "reference" | "concept";
          heroImages: HeroImage[];
          approvedHeroUrl: string | null;
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
          setExtractedFrameCount(data.extractedFrameCount);
          setR2PublicUrl(data.r2PublicUrl);
          setProjectType(data.projectType ?? "reference");
          setHeroImages(data.heroImages ?? []);
          setApprovedHeroUrl(data.approvedHeroUrl ?? null);
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
              // Completed seed image — add to versions list (skip if already added by API response)
              if (event.assetVersionId) {
                setScenes((prev) =>
                  prev.map((s) => {
                    if (s.sceneId !== event.sceneId) return s;
                    // Deduplicate: skip if this version was already added by handleGenerate
                    if (s.seedVersions.some((v) => v.id === event.assetVersionId)) {
                      return { ...s, seedGenerating: false };
                    }
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
              // Refetch production state to get the new video version with its prompt
              fetch(`/api/projects/${projectId}/production-state`)
                .then((r) => r.json())
                .then((data: { scenes: DbScene[]; assetVersions: DbAssetVersion[]; jobs: DbJob[]; extractedFrameCount: number; r2PublicUrl: string }) => {
                  const refreshed = data.scenes.map((s, i) =>
                    dbToState(s, data.assetVersions, data.jobs, SCENE_COLORS[i % SCENE_COLORS.length], projectId)
                  );
                  // Only update video versions for the completed scene to avoid resetting other state
                  const updated = refreshed.find((s) => s.sceneId === event.sceneId);
                  if (updated) {
                    setScenes((prev) =>
                      prev.map((s) =>
                        s.sceneId === event.sceneId
                          ? { ...s, videoVersions: updated.videoVersions }
                          : s
                      )
                    );
                  }
                })
                .catch(() => {});
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
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              chatOpen
                ? "bg-violet-100 text-violet-700"
                : "bg-neutral-100 text-neutral-600 hover:bg-violet-50 hover:text-violet-600"
            )}
          >
            <Brain className="h-4 w-4" />
            AI Chat
          </button>
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

      {/* ── Tab content — all tabs stay mounted so state syncs instantly ── */}
      <div className="flex-1 overflow-hidden">
        <div className={activeTab === "3b" ? "h-full" : "hidden"}>
          <Tab3B
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
            script={script}
            onScriptChange={setScript}
            productTags={productTags}
          />
        </div>
        <div className={activeTab === "3a" ? "h-full" : "hidden"}>
          <Tab3A
            scenes={scenes}
            updateScene={updateScene}
            addSeedVersion={addSeedVersion}
            addScene={addScene}
            removeScene={removeScene}
            projectId={projectId}
            extractedFrameCount={extractedFrameCount}
            r2PublicUrl={r2PublicUrl}
            projectType={projectType}
            heroImages={heroImages}
            approvedHeroUrl={approvedHeroUrl}
            onHeroImagesChange={setHeroImages}
            onApprovedHeroChange={setApprovedHeroUrl}
            onHeroGeneratingChange={setHeroGenerating}
            productTags={productTags}
          />
        </div>
        <div className={activeTab === "review" ? "h-full" : "hidden"}>
          <TabReview
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
            onGoTo3A={() => setActiveTab("3a")}
            onGoTo3B={() => setActiveTab("3b")}
            productTags={productTags}
          />
        </div>
        <div className={activeTab === "3c" ? "h-full" : "hidden"}>
          <Tab3C
            scenes={scenes}
            updateScene={updateScene}
            projectId={projectId}
          />
        </div>
      </div>

      {/* Global queue tracker */}
      <QueueTracker scenes={scenes} heroGenerating={heroGenerating} />

      {/* AI Chat panel */}
      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projectId={projectId}
        scenes={scenes}
      />
    </div>
  );
}
