"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Film,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | { kind: "idle" }
  | { kind: "selected"; file: File; clientDurationS: number | null }
  | { kind: "uploading"; file: File; progress: number }
  | { kind: "processing" }
  | {
      kind: "done";
      durationMs: number;
      fps: number;
      totalFrames: number;
      width: number;
      height: number;
    }
  | { kind: "error"; message: string };

const ACCEPTED = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtSize(b: number) {
  return b < 1e6 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1e6).toFixed(1)} MB`;
}
function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  return m > 0
    ? `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(0)}s`;
}

/** XHR POST to server-side upload endpoint with progress events. */
function xhrUpload(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<{ key: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as { key: string });
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        reject(new Error(`Upload failed (HTTP ${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

/** Read video duration client-side via a temporary <video> element. */
function getClientDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    el.src = url;
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UploadZone({ projectId }: { projectId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling: watch project status after process-video is triggered
  useEffect(() => {
    if (phase.kind !== "processing") return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) return;
        const p = await res.json();

        if (p.status === "manifest_review") {
          clearInterval(pollRef.current!);
          qc.setQueryData(["project", projectId], p);
          setPhase({
            kind: "done",
            durationMs: p.referenceVideoDurationMs ?? 0,
            fps: p.referenceFps ?? 0,
            totalFrames: p.totalFrames ?? 0,
            width: 0,
            height: 0,
          });
        } else if (p.status === "uploading") {
          // Server reverted — processing failed
          clearInterval(pollRef.current!);
          setPhase({ kind: "error", message: "Video processing failed. Try again." });
        }
      } catch {
        // transient network error — keep polling
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase.kind, projectId, qc]);

  // ── File validation & selection
  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setPhase({ kind: "error", message: "Unsupported format. Use MP4, MOV, or WebM." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setPhase({
        kind: "error",
        message: `File too large — ${fmtSize(file.size)} (max 500 MB).`,
      });
      return;
    }
    const clientDurationS = await getClientDuration(file);
    setPhase({ kind: "selected", file, clientDurationS });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  // ── Upload flow
  async function startUpload() {
    if (phase.kind !== "selected") return;
    const { file } = phase;

    try {
      // 1. Upload file to server → R2 (server proxies to avoid CORS issues)
      setPhase({ kind: "uploading", file, progress: 0 });
      const { key } = await xhrUpload(
        `/api/projects/${projectId}/upload-video`,
        file,
        (pct) => setPhase({ kind: "uploading", file, progress: pct })
      );

      // 2. Trigger server-side video processing
      setPhase({ kind: "processing" });
      const procRes = await fetch(`/api/projects/${projectId}/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!procRes.ok) throw new Error("Failed to start video processing");
      // Polling takes over from here (via useEffect)
    } catch (err) {
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  // ── Error state
  if (phase.kind === "error") {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-5 flex items-start gap-4">
        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-red-700">{phase.message}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase({ kind: "idle" })}
          className="shrink-0 text-red-500 hover:text-red-700 hover:bg-red-100 h-7 px-2"
        >
          Try again
        </Button>
      </div>
    );
  }

  // ── Done state
  if (phase.kind === "done") {
    const { durationMs, fps, totalFrames } = phase;
    return (
      <div className="rounded-xl border border-green-100 bg-green-50 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Video processed successfully
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Duration", value: fmtDur(durationMs / 1000) },
            { label: "Frame rate", value: `${fps} fps` },
            { label: "Total frames", value: totalFrames.toLocaleString() },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg bg-white border border-green-100 px-3 py-2.5"
            >
              <p className="text-[10px] uppercase tracking-widest text-green-700 font-medium">
                {label}
              </p>
              <p className="text-sm font-semibold text-neutral-900 mt-0.5 tabular-nums">
                {value}
              </p>
            </div>
          ))}
        </div>
        <Button
          onClick={() => router.push(`/projects/${projectId}/manifest`)}
          className="w-full bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
        >
          Continue to Scene Manifest
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ── Processing state
  if (phase.kind === "processing") {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 text-neutral-400 animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium text-neutral-700">Analyzing video…</p>
          <p className="text-xs text-neutral-400 mt-0.5">
            Extracting metadata with ffmpeg. This takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  // ── Uploading state
  if (phase.kind === "uploading") {
    const { file, progress } = phase;
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="shrink-0 rounded-lg bg-neutral-100 p-3">
            <Film className="h-5 w-5 text-neutral-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{file.name}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{fmtSize(file.size)}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">
            {progress}%
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full bg-neutral-900 rounded-full transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-neutral-400">
          Uploading directly to Cloudflare R2…
        </p>
      </div>
    );
  }

  // ── Selected state
  if (phase.kind === "selected") {
    const { file, clientDurationS } = phase;
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-lg bg-neutral-100 p-3">
            <Film className="h-5 w-5 text-neutral-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{file.name}</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {fmtSize(file.size)}
              {clientDurationS != null && ` · ${fmtDur(clientDurationS)}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-7 w-7 text-neutral-400 hover:text-neutral-700"
            onClick={() => setPhase({ kind: "idle" })}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={startUpload}
          className="w-full bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload video
        </Button>
      </div>
    );
  }

  // ── Idle / dropzone state
  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-colors p-10 select-none",
        dragOver
          ? "border-neutral-400 bg-neutral-50"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Upload className="h-8 w-8 text-neutral-300 mb-3" />
      <p className="text-sm font-medium text-neutral-700">Drop your video here</p>
      <p className="text-xs text-neutral-400 mt-1">
        MP4, MOV, or WebM · up to 500 MB · 15–60 seconds
      </p>
      <input
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </label>
  );
}
