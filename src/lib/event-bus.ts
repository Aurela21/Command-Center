import { EventEmitter } from "events";

// Singleton — survives Next.js hot reloads in dev
declare global {
  var _eventBus: EventEmitter | undefined;
}

const eventBus =
  globalThis._eventBus ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200); // support many concurrent SSE connections
    return emitter;
  })();

if (process.env.NODE_ENV !== "production") {
  globalThis._eventBus = eventBus;
}

export { eventBus };

// ─── Typed SSE events (matches spec) ────────────────────────────────────────

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
      sceneId: string | null;
      assetVersionId: string | null;
      qualityScore: unknown;
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

export function emit(event: SSEEvent): void {
  eventBus.emit("sse", event);
}
