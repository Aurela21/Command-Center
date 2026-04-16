"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UploadZone } from "@/components/upload-zone";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ProgressStepper, type Step } from "@/components/progress-stepper";
import type { Project } from "@/db/schema";

function getVideoSteps(status: string): Step[] {
  const steps: Step[] = [
    { id: "upload", label: "Upload", status: "upcoming" },
    { id: "manifest", label: "Manifest", status: "locked" },
    { id: "production", label: "Production", status: "locked" },
  ];
  if (["uploading", "analyzing"].includes(status)) {
    steps[0].status = "current";
  } else if (status === "manifest_review") {
    steps[0].status = "completed";
    steps[1].status = "current";
  } else if (["producing", "complete"].includes(status)) {
    steps[0].status = "completed";
    steps[1].status = "completed";
    steps[2].status = status === "complete" ? "completed" : "current";
  }
  return steps;
}

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
        <p className="text-sm text-[#a1a1aa]">Project not found.</p>
        <Button variant="link" className="px-0 mt-2" onClick={() => router.push("/projects")}>
          Back to projects
        </Button>
      </div>
    );
  }

  const alreadyUploaded = project.status !== "uploading";

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <Breadcrumbs crumbs={[{ label: "Projects", href: "/projects" }, { label: project?.name ?? "...", href: `/projects/${id}/upload` }, { label: "Upload" }]} />
      <ProgressStepper
        steps={getVideoSteps(project.status)}
        onStepClick={(stepId) => {
          if (stepId === "upload") return;
          if (stepId === "manifest") router.push(`/projects/${id}/manifest`);
          if (stepId === "production") router.push(`/projects/${id}/production`);
        }}
      />
      {/* ── Header ── */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-[#71717a] mb-2">
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
            className="text-2xl font-semibold text-[#fafafa] bg-transparent border-b-2 border-[#3f3f46] outline-none w-full pb-0.5"
          />
        ) : (
          <h1
            className="text-2xl font-semibold text-[#fafafa] cursor-text hover:text-[#a1a1aa] transition-colors"
            onClick={() => {
              setNameValue(project.name);
              setNameEditing(true);
            }}
            title="Click to rename"
          >
            {project.name}
          </h1>
        )}
        <p className="text-sm text-[#71717a] mt-1">
          Click the title to rename &middot; Upload a 15–60 second reference video
        </p>
      </div>

      {/* ── Video upload / already-uploaded ── */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-[#a1a1aa] mb-3">
          Reference Video
        </h2>

        {alreadyUploaded ? (
          // Show processed metadata summary if available
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-400">
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
                    className="rounded-lg bg-[#18181b] border border-green-500/20 px-3 py-2.5"
                  >
                    <p className="text-[10px] uppercase tracking-widest text-green-400 font-medium">
                      {label}
                    </p>
                    <p className="text-sm font-semibold text-[#fafafa] mt-0.5 tabular-nums">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => router.push(`/projects/${id}/manifest`)}
              className="w-full bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-2"
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
      <div className="rounded-lg bg-[#09090b] border border-[#1a1a1e] px-4 py-3 text-xs text-[#a1a1aa] space-y-0.5">
        <p>
          <span className="font-medium text-[#a1a1aa]">Status:</span>{" "}
          <span className="capitalize">{project.status.replace(/_/g, " ")}</span>
        </p>
        <p>
          <span className="font-medium text-[#a1a1aa]">Project ID:</span>{" "}
          <span className="font-mono">{project.id}</span>
        </p>
        <p>
          <span className="font-medium text-[#a1a1aa]">Created:</span>{" "}
          {new Date(project.createdAt!).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
