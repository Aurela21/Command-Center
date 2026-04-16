"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, X, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Project } from "@/db/schema";

export function ProjectSettings({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const tagMutation = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klingElementTags: tags }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json() as Promise<Project>;
    },
    onSuccess: (updated) => qc.setQueryData(["project", projectId], updated),
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

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#18181b]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        <Settings className="h-3.5 w-3.5 text-[#71717a]" />
        <span className="text-sm font-medium text-[#a1a1aa] flex-1">
          Project Settings
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#71717a] transition-transform",
            !open && "-rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <h3 className="text-sm font-medium text-[#a1a1aa] mb-1">
              Kling Element Tags
            </h3>
            <p className="text-xs text-[#71717a] mb-3">
              Tags registered in Kling (e.g.{" "}
              <span className="font-mono">airplane_hoodie</span>,{" "}
              <span className="font-mono">sarah</span>). Auto-injected into every
              scene prompt.
            </p>
            <div
              className="flex flex-wrap gap-2 p-3 rounded-lg border border-[#27272a] bg-[#09090b] min-h-[48px] cursor-text focus-within:ring-2 focus-within:ring-[#27272a] focus-within:border-[#3f3f46] transition-all"
              onClick={() =>
                document.getElementById("project-settings-tag-input")?.focus()
              }
            >
              {currentTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="gap-1.5 pl-2.5 pr-1.5 py-0.5 text-xs font-mono bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTag(tag);
                    }}
                    className="text-[#71717a] hover:text-[#a1a1aa]"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <Input
                id="project-settings-tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onPaste={handleTagPaste}
                onBlur={() => {
                  if (tagInput.trim()) addTag(tagInput);
                }}
                placeholder={
                  currentTags.length === 0
                    ? "Type a tag and press Enter or comma..."
                    : ""
                }
                className="border-0 shadow-none p-0 h-auto flex-1 min-w-32 text-sm focus-visible:ring-0 bg-transparent"
              />
              {tagInput.trim() && (
                <button
                  type="button"
                  onClick={() => addTag(tagInput)}
                  className="shrink-0 text-[#71717a] hover:text-[#a1a1aa]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-[#71717a] mt-1.5">
              Enter or comma to add &middot; Backspace to remove last
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
