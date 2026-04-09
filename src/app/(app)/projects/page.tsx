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
import { Plus, Film, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Project } from "@/db/schema";

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-amber-400",
  analyzing: "bg-blue-400",
  manifest_review: "bg-violet-400",
  producing: "bg-orange-400",
  complete: "bg-green-500",
};

const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading",
  analyzing: "Analyzing",
  manifest_review: "Manifest Review",
  producing: "Producing",
  complete: "Complete",
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

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      return res.json() as Promise<Project>;
    },
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDialogOpen(false);
      setNewName("");
      router.push(`/projects/${project.id}/upload`);
    },
    onError: () => toast.error("Failed to create project"),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    createMutation.mutate(newName.trim());
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Projects</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {isLoading
              ? ""
              : `${projects?.length ?? 0} project${projects?.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={() => {
            setNewName("");
            setDialogOpen(true);
          }}
          className="bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
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
          <div className="rounded-2xl bg-neutral-100 p-6 mb-4">
            <Film className="h-10 w-10 text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-700">No projects yet</p>
          <p className="text-sm text-neutral-400 mt-1">
            Create a project to start building your video ad.
          </p>
          <Button
            className="mt-6 bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
            onClick={() => {
              setNewName("");
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects?.map((project) => (
            <button
              key={project.id}
              onClick={() =>
                router.push(`/projects/${project.id}/upload`)
              }
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-neutral-200 bg-white",
                "hover:border-neutral-300 hover:shadow-sm transition-all text-left group"
              )}
            >
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  STATUS_COLORS[project.status] ?? "bg-neutral-300"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">
                  {project.name}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {STATUS_LABELS[project.status] ?? project.status} ·{" "}
                  {new Date(project.createdAt!).toLocaleDateString()}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 shrink-0 transition-colors" />
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
            <div className="py-4 space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Summer Campaign v2"
                className="bg-white"
              />
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
                className="bg-neutral-900 hover:bg-neutral-700 text-white"
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
