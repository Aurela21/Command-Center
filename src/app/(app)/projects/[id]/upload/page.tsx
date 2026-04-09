"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UploadZone } from "@/components/upload-zone";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Plus, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/db/schema";

function fmtDur(ms: number) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return m > 0
    ? `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : `${s.toFixed(1)}s`;
}

export default function UploadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["project", id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  // ── Inline project name editing ──────────────────────────────────────────
  const [nameEditing, setNameEditing] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<Project>;
    },
    onSuccess: (updated) => qc.setQueryData(["project", id], updated),
    onError: () => toast.error("Failed to save project name"),
  });

  function commitName() {
    setNameEditing(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project?.name) renameMutation.mutate(trimmed);
  }

  // ── Kling element tags ───────────────────────────────────────────────────
  const [tagInput, setTagInput] = useState("");

  const tagMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klingElementTags: tags }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<Project>;
    },
    onSuccess: (updated) => qc.setQueryData(["project", id], updated),
    onError: () => toast.error("Failed to save element tags"),
  });

  const currentTags: string[] = project?.klingElementTags ?? [];

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (!tag || currentTags.includes(tag)) return;
    tagMutation.mutate([...currentTags, tag]);
    setTagInput("");
  }
  function removeTag(tag: string) {
    tagMutation.mutate(currentTags.filter((t) => t !== tag));
  }
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === "Backspace" && tagInput === "" && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  }
  function handleTagPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const parts = e.clipboardData
      .getData("text")
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const newTags = [
      ...currentTags,
      ...parts
        .map((p) => p.toLowerCase().replace(/\s+/g, "_"))
        .filter((t) => !currentTags.includes(t)),
    ];
    tagMutation.mutate(newTags);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10">
        <p className="text-sm text-neutral-500">Project not found.</p>
        <Button variant="link" className="px-0 mt-2" onClick={() => router.push("/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  const alreadyUploaded = project.status !== "uploading";

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-2">
          Step 1 — Upload
        </p>
        {nameEditing ? (
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setNameEditing(false);
            }}
            className="text-2xl font-semibold text-neutral-900 bg-transparent border-b-2 border-neutral-300 outline-none w-full pb-0.5"
          />
        ) : (
          <h1
            className="text-2xl font-semibold text-neutral-900 cursor-text hover:text-neutral-600 transition-colors"
            onClick={() => {
              setNameValue(project.name);
              setNameEditing(true);
            }}
            title="Click to rename"
          >
            {project.name}
          </h1>
        )}
        <p className="text-sm text-neutral-400 mt-1">
          Click the title to rename &middot; Upload a 15–60 second reference video
        </p>
      </div>

      {/* ── Kling element tags ── */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-700 mb-1">
          Kling Element Tags
        </h2>
        <p className="text-xs text-neutral-400 mb-3">
          Tags registered in Kling (e.g.{" "}
          <span className="font-mono">airplane_hoodie</span>,{" "}
          <span className="font-mono">sarah</span>). Auto-injected into every
          scene prompt.
        </p>
        <div
          className="flex flex-wrap gap-2 p-3 rounded-lg border border-neutral-200 bg-white min-h-[48px] cursor-text focus-within:ring-2 focus-within:ring-neutral-200 focus-within:border-neutral-300 transition-all"
          onClick={() => document.getElementById("tag-input")?.focus()}
        >
          {currentTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1.5 pl-2.5 pr-1.5 py-0.5 text-xs font-mono bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            >
              {tag}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
          <Input
            id="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onPaste={handleTagPaste}
            onBlur={() => {
              if (tagInput.trim()) addTag(tagInput);
            }}
            placeholder={
              currentTags.length === 0
                ? "Type a tag and press Enter or comma…"
                : ""
            }
            className="border-0 shadow-none p-0 h-auto flex-1 min-w-32 text-sm focus-visible:ring-0 bg-transparent"
          />
          {tagInput.trim() && (
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              className="shrink-0 text-neutral-400 hover:text-neutral-700"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-1.5">
          Enter or comma to add &middot; Backspace to remove last
        </p>
      </section>

      {/* ── Video upload / already-uploaded ── */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-700 mb-3">
          Reference Video
        </h2>

        {alreadyUploaded ? (
          // Show processed metadata summary if available
          <div className="rounded-xl border border-green-100 bg-green-50 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-800">
                Video uploaded and processed
              </p>
            </div>
            {project.referenceVideoDurationMs != null && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Duration", value: fmtDur(project.referenceVideoDurationMs) },
                  { label: "Frame rate", value: `${project.referenceFps ?? "—"} fps` },
                  { label: "Total frames", value: (project.totalFrames ?? 0).toLocaleString() },
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
            )}
            <Button
              onClick={() => router.push(`/projects/${id}/manifest`)}
              className="w-full bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
            >
              Go to Scene Manifest
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <UploadZone projectId={id} />
        )}
      </section>

      {/* ── Debug info ── */}
      <div className="rounded-lg bg-neutral-50 border border-neutral-100 px-4 py-3 text-xs text-neutral-500 space-y-0.5">
        <p>
          <span className="font-medium text-neutral-700">Status:</span>{" "}
          <span className="capitalize">{project.status.replace(/_/g, " ")}</span>
        </p>
        <p>
          <span className="font-medium text-neutral-700">Project ID:</span>{" "}
          <span className="font-mono">{project.id}</span>
        </p>
        <p>
          <span className="font-medium text-neutral-700">Created:</span>{" "}
          {new Date(project.createdAt!).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
