export type SeedVersion = {
  id: string;
  createdAt: string;
  qualityScore: number; // 0–100
  color: string;
  imageUrl?: string; // R2 public URL (undefined for mock/placeholder)
  isRejected?: boolean;
  rejectionReason?: string;
};

export type VideoJobStatus =
  | "idle"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export type VideoVersion = {
  id: string;
  createdAt: string;
  fileUrl: string;
  prompt?: string;
  isRejected?: boolean;
  rejectionReason?: string;
};

export type SceneProductionState = {
  sceneId: string;
  sceneOrder: number;
  description: string;
  referenceFrame: number;
  referenceFrameUrl?: string; // R2 public URL for the reference frame image
  targetClipDurationS: number;
  color: string;
  // Step 3A — Seed images (Nano Banana)
  nanoBananaPrompt: string;
  seedVersions: SeedVersion[];
  approvedSeedVersionId: string | null;
  seedImageApproved: boolean;
  seedGenerating?: boolean; // true while a nano_banana job is queued/processing
  // Step 3B — Kling prompts
  klingPrompt: string;
  klingPromptApproved: boolean;
  // Step 3C — Video generation (Kling)
  videoJobStatus: VideoJobStatus;
  videoJobProgress: number; // 0–100
  videoJobError?: string;
  videoJobId?: string;
  videoUrl?: string; // R2 public URL for completed video (latest)
  videoVersions: VideoVersion[]; // all completed video generations
  // Quality score populated via SSE job:completed event
  qualityScore?: {
    overall: number; // 0–100
    notes: string;
    lipSyncRisk?: boolean;
  };
};

// SSEEvent mirrored here for client components — avoids importing Node.js
// EventEmitter from event-bus.ts in the browser bundle.
export type SSEEvent =
  | {
      type: "job:progress";
      jobId: string;
      sceneId: string | null;
      progress: number;
      eta: number | null;
    }
  | {
      type: "job:completed";
      jobId: string;
      jobType: string;
      sceneId: string | null;
      assetVersionId: string | null;
      qualityScore: unknown;
      fileUrl?: string | null;
    }
  | {
      type: "job:failed";
      jobId: string;
      sceneId: string | null;
      error: string;
      canRetry: boolean;
    }
  | {
      type: "job:retrying";
      jobId: string;
      sceneId: string | null;
      attemptCount: number;
    }
  | {
      type: "project:stage_change";
      projectId: string;
      stage: string;
      substage?: string;
    };

export type ProductionTab = "3a" | "3b" | "review" | "3c";
