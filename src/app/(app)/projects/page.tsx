"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Film, ChevronRight, Video, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/db/schema";

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-amber-400",
  analyzing: "bg-blue-400",
  manifest_review: "bg-violet-400",
  producing: "bg-orange-400",
  complete: "bg-green-500",
  concept_setup: "bg-violet-400",
};

const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading",
  analyzing: "Analyzing",
  manifest_review: "Manifest Review",
  producing: "Producing",
  complete: "Complete",
  concept_setup: "Concept Setup",
};

export default function ProjectsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"reference" | "concept">("reference");

  const createMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: "reference" | "concept" }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      setNewName("");
      setNewType("reference");
      const dest = (project as Project & { projectType?: string }).projectType === "concept"
        ? `/projects/${project.id}/concept`
        : `/projects/${project.id}/upload`;
      router.push(dest);
    },
    onError: () => toast.error("Failed to create project"),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate({ name: newName.trim(), type: newType });
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Projects</h1>
          <p className="text-sm text-[#71717a] mt-0.5">
            {isLoading
              ? ""
              : `${projects?.length ?? 0} project${projects?.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setNewName("");
              setNewType("concept");
              setDialogOpen(true);
            }}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
          >
            <Sparkles className="h-4 w-4" />
            New Concept
          </Button>
          <Button
            onClick={() => {
              setNewName("");
              setNewType("reference");
              setDialogOpen(true);
            }}
            variant="outline"
            className="gap-2"
          >
            <Video className="h-4 w-4" />
            Iteration
          </Button>
        </div>
      </div>

      {/* Project list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="rounded-2xl bg-[#27272a] p-6 mb-4">
            <Film className="h-10 w-10 text-[#52525b]" />
          </div>
          <p className="text-sm font-medium text-[#a1a1aa]">No projects yet</p>
          <p className="text-sm text-[#71717a] mt-1">
            Create a project to start building your video ad.
          </p>
          <div className="mt-6 flex gap-2">
            <Button
              onClick={() => { setNewName(""); setNewType("concept"); setDialogOpen(true); }}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
            >
              <Sparkles className="h-4 w-4" />
              New Concept
            </Button>
            <Button
              onClick={() => { setNewName(""); setNewType("reference"); setDialogOpen(true); }}
              variant="outline"
              className="gap-2"
            >
              <Video className="h-4 w-4" />
              Iteration
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {projects?.map((project) => (
            <button
              key={project.id}
              onClick={() => {
                const pt = (project as Project & { projectType?: string }).projectType;
                if (pt === "concept") {
                  const s = project.status;
                  router.push(s === "producing" || s === "complete"
                    ? `/projects/${project.id}/production`
                    : `/projects/${project.id}/concept`);
                } else {
                  router.push(`/projects/${project.id}/upload`);
                }
              }}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-[#27272a] bg-[#18181b]",
                "hover:border-[#3f3f46] hover:shadow-sm transition-all text-left group"
              )}
            >
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  STATUS_COLORS[project.status] ?? "bg-[#52525b]"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[#fafafa] truncate">
                    {project.name}
                  </p>
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0",
                    (project as Project & { projectType?: string }).projectType === "concept"
                      ? "bg-violet-500/20 text-violet-400"
                      : "bg-[#27272a] text-[#a1a1aa]"
                  )}>
                    {(project as Project & { projectType?: string }).projectType === "concept" ? "Concept" : "Iteration"}
                  </span>
                </div>
                <p className="text-xs text-[#71717a] mt-0.5">
                  {STATUS_LABELS[project.status] ?? project.status} ·{" "}
                  {new Date(project.createdAt!).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-[#52525b] group-hover:text-[#a1a1aa] shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="py-4 space-y-4">
              {/* Type selector */}
              <div className="space-y-2">
                <Label>Project type</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewType("reference")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                      newType === "reference"
                        ? "border-[#6366f1] bg-[#09090b]"
                        : "border-[#27272a] hover:border-[#3f3f46]"
                    )}
                  >
                    <Video className={cn("h-6 w-6", newType === "reference" ? "text-[#fafafa]" : "text-[#71717a]")} />
                    <div>
                      <p className={cn("text-sm font-medium", newType === "reference" ? "text-[#fafafa]" : "text-[#a1a1aa]")}>From Reference</p>
                      <p className="text-[11px] text-[#71717a] mt-0.5">Upload a video to recreate</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType("concept")}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center",
                      newType === "concept"
                        ? "border-violet-600 bg-violet-500/10"
                        : "border-[#27272a] hover:border-[#3f3f46]"
                    )}
                  >
                    <Sparkles className={cn("h-6 w-6", newType === "concept" ? "text-violet-600" : "text-[#71717a]")} />
                    <div>
                      <p className={cn("text-sm font-medium", newType === "concept" ? "text-violet-400" : "text-[#a1a1aa]")}>New Concept</p>
                      <p className="text-[11px] text-[#71717a] mt-0.5">Build a video from scratch</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Summer Campaign v2"
                  className="bg-[#18181b]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newName.trim() || createMutation.isPending}
                className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
