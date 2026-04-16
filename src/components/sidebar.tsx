"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
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
  Sparkles,
  ImagePlus,
  ShoppingBag,
} from "lucide-react";
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
          ? "bg-[rgba(99,102,241,0.12)] text-[#fafafa]"
          : "text-[#a1a1aa] hover:text-[#fafafa] hover:bg-[#27272a]",
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-[#27272a] bg-[#0f0f12] flex flex-col h-screen sticky top-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-[#1a1a1e]">
        <span className="text-sm font-medium text-[#fafafa]">
          Command Center
        </span>
      </div>

      {/* Global nav */}
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
        <NavLink
          item={{
            label: "Products",
            href: "/knowledge/product_assets",
            icon: <ShoppingBag className="h-4 w-4" />,
            locked: false,
          }}
          active={pathname.startsWith("/knowledge/product_assets")}
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
        <NavLink
          item={{
            label: "Knowledge Base",
            href: "/knowledge",
            icon: <BookOpen className="h-4 w-4" />,
            locked: false,
          }}
          active={pathname === "/knowledge" || (pathname.startsWith("/knowledge") && !pathname.startsWith("/knowledge/product_assets"))}
        />

        {/* Project nav */}
        {projectId && (
          <>
            <Separator className="my-2" />
            <div className="px-3 py-1.5">
              <p className="text-xs font-medium text-[#fafafa] truncate">
                {project?.name ?? "Loading\u2026"}
              </p>
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight bg-[#27272a] text-[#a1a1aa]">
                {isConcept ? "From Scratch" : "From Reference"}
              </span>
            </div>
            {iterationSubItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={pathname === item.href}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[#1a1a1e]">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-sm text-[#71717a] hover:text-[#fafafa] hover:bg-[#27272a] transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
