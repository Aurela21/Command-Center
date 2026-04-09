"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOCK_SCENES, SCENE_COLORS } from "../manifest/mock-data";
import type { SceneProductionState, SSEEvent, ProductionTab } from "./types";
import { Tab3A } from "./tab-3a";
import { Tab3B } from "./tab-3b";
import { TabReview } from "./tab-review";
import { Tab3C } from "./tab-3c";

// ─── Initial state ───────────────────────────────────────────────────────────

function initScenes(): SceneProductionState[] {
  return MOCK_SCENES.map((s, i) => ({
    sceneId: s.id,
    sceneOrder: s.sceneOrder,
    description: s.description,
    referenceFrame: s.referenceFrame,
    targetClipDurationS: s.targetClipDurationS,
    color: SCENE_COLORS[i % SCENE_COLORS.length],
    nanoBananaPrompt: "",
    seedVersions: [],
    approvedSeedVersionId: null,
    seedImageApproved: false,
    klingPrompt: "",
    klingPromptApproved: false,
    videoJobStatus: "idle",
    videoJobProgress: 0,
  }));
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
  const [scenes, setScenes] = useState<SceneProductionState[]>(initScenes);
  const [script, setScript] = useState<string>("");

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<SceneProductionState>) => {
      setScenes((prev) =>
        prev.map((s) => (s.sceneId === sceneId ? { ...s, ...patch } : s))
      );
    },
    []
  );

  // SSE listener — wires up live job progress for 3C once real jobs exist
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
              qualityScore: qs,
            });
          }
          break;
        case "job:failed":
          if (event.sceneId) {
            updateScene(event.sceneId, {
              videoJobStatus: "failed",
              videoJobError: event.error,
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
          <Tab3A scenes={scenes} updateScene={updateScene} />
        )}
        {activeTab === "3b" && (
          <Tab3B
            scenes={scenes}
            updateScene={updateScene}
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
