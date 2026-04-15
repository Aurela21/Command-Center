"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  LayoutList,
  Clapperboard,
  BookOpen,
  Home,
  Lock,
  Circle,
  LogOut,
  ChevronDown,
  Layers,
  Sparkles,
  ImagePlus,
} from "lucide-react";
import { useRef, useState, useCallback } from "react";
import type { Project } from "@/db/schema";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  locked: boolean;
  statusDot?: "idle" | "active" | "done" | "error";
};

function StatusDot({ state }: { state: NavItem["statusDot"] }) {
  if (!state || state === "idle") return null;
  return (
    <Circle
      className={cn(
        "h-1.5 w-1.5 fill-current",
        state === "active" && "text-amber-400",
        state === "done" && "text-green-500",
        state === "error" && "text-red-500"
      )}
    />
  );
}

function NavLink({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
        active
          ? "bg-neutral-900 text-white"
          : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100",
        item.locked && "opacity-40 cursor-not-allowed pointer-events-none"
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.statusDot && <StatusDot state={item.statusDot} />}
      {item.locked && <Lock className="h-3 w-3 shrink-0" />}
    </div>
  );

  if (item.locked) return inner;

  return (
    <Link href={item.href} className="block">
      {inner}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const projectId = typeof params?.id === "string" ? params.id : null;

  const { data: project } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  // Inline-editable project name
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [iterationOpen, setIterationOpen] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      return res.json();
    },
    onSuccess: (updated) => {
      qc.setQueryData(["project", projectId], updated);
    },
  });

  const startEdit = useCallback(() => {
    setNameValue(project?.name ?? "");
    setEditing(true);
    setTimeout(() => nameRef.current?.select(), 0);
  }, [project?.name]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project?.name) {
      renameMutation.mutate(trimmed);
    }
  }, [nameValue, project?.name, renameMutation]);

  // Determine locked states from project status
  // TODO: change uploadDone back to `status !== "uploading"` once the upload flow is wired up
  const uploadDone = !!project; // unlock for all projects during development
  const manifestDone =
    project &&
    ["producing", "complete"].includes(project.status ?? "");

  function uploadDotState(): NavItem["statusDot"] {
    if (!project) return "idle";
    if (project.status === "uploading") return "active";
    if (project.status === "analyzing") return "active";
    return "done";
  }

  const isConcept = (project as Project & { projectType?: string })?.projectType === "concept";

  const iterationSubItems: NavItem[] = projectId
    ? isConcept
      ? [
          {
            label: "Concept Setup",
            href: `/projects/${projectId}/concept`,
            icon: <Sparkles className="h-3.5 w-3.5" />,
            locked: false,
          },
          {
            label: "Production",
            href: `/projects/${projectId}/production`,
            icon: <Clapperboard className="h-3.5 w-3.5" />,
            locked: !manifestDone,
          },
        ]
      : [
          {
            label: "Upload",
            href: `/projects/${projectId}/upload`,
            icon: <Upload className="h-3.5 w-3.5" />,
            locked: false,
            statusDot: uploadDotState(),
          },
          {
            label: "Scene Manifest",
            href: `/projects/${projectId}/manifest`,
            icon: <LayoutList className="h-3.5 w-3.5" />,
            locked: !uploadDone,
          },
          {
            label: "Production",
            href: `/projects/${projectId}/production`,
            icon: <Clapperboard className="h-3.5 w-3.5" />,
            locked: !manifestDone,
          },
        ]
    : [];

  const isInIteration = projectId && (
    pathname.includes("/upload") ||
    pathname.includes("/manifest") ||
    pathname.includes("/production") ||
    pathname.includes("/concept")
  );

  const knowledgeItem: NavItem = {
    label: "Knowledge Base",
    href: "/knowledge",
    icon: <BookOpen className="h-4 w-4" />,
    locked: false,
  };

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-neutral-200 bg-white flex flex-col h-screen sticky top-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-neutral-100">
        {projectId ? (
          editing ? (
            <input
              ref={nameRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full text-sm font-medium text-neutral-900 bg-transparent border-b border-neutral-300 outline-none pb-0.5"
              autoFocus
            />
          ) : (
            <button
              onClick={startEdit}
              className="w-full text-left text-sm font-medium text-neutral-900 hover:text-neutral-600 truncate transition-colors"
              title="Click to rename"
            >
              {project?.name ?? "Loading…"}
            </button>
          )
        ) : (
          <span className="text-sm font-medium text-neutral-400">
            No project selected
          </span>
        )}
      </div>

      {/* Project nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <NavLink
          item={{
            label: "Home",
            href: "/projects",
            icon: <Home className="h-4 w-4" />,
            locked: false,
          }}
          active={pathname === "/projects"}
        />
        {projectId && (
          <>
            <button
              onClick={() => setIterationOpen((o) => !o)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors w-full",
                isInIteration
                  ? "bg-neutral-100 text-neutral-900 font-medium"
                  : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
              )}
            >
              {isConcept ? (
                <Sparkles className="h-4 w-4 shrink-0" />
              ) : (
                <Layers className="h-4 w-4 shrink-0" />
              )}
              <span className="flex-1 text-left truncate">
                {isConcept ? "New Concept" : "Iteration"}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  !iterationOpen && "-rotate-90"
                )}
              />
            </button>
            {iterationOpen && (
              <div className="ml-3 pl-3 border-l border-neutral-100 space-y-0.5 mt-0.5">
                {iterationSubItems.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={pathname === item.href}
                  />
                ))}
              </div>
            )}
            <Separator className="my-2" />
          </>
        )}

        <NavLink
          item={knowledgeItem}
          active={pathname.startsWith("/knowledge")}
        />

        <NavLink
          item={{
            label: "Static Ads",
            href: "/static-ads",
            icon: <ImagePlus className="h-4 w-4" />,
            locked: false,
          }}
          active={pathname.startsWith("/static-ads")}
        />
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-neutral-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-sm text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
