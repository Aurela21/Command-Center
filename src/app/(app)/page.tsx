"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Film, ImagePlus, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project } from "@/db/schema";

type StaticAdJobSummary = {
  id: string;
  status: string;
  productName: string | null;
  inputImageUrl: string | null;
  createdAt: string;
};

type ActivityItem = {
  type: "video" | "static-ad";
  name: string;
  status: string;
  createdAt: string;
  href: string;
};

const VIDEO_STATUS_COLORS: Record<string, string> = {
  uploading: "bg-amber-400",
  analyzing: "bg-blue-400",
  manifest_review: "bg-violet-400",
  producing: "bg-orange-400",
  complete: "bg-green-500",
  concept_setup: "bg-violet-400",
};

const STATIC_AD_STATUS_COLORS: Record<string, string> = {
  uploading: "bg-amber-400",
  analyzing: "bg-blue-400",
  analyzed: "bg-violet-400",
  confirmed: "bg-indigo-400",
  generating: "bg-orange-400",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const VIDEO_ACTIVE_STATUSES = new Set([
  "uploading",
  "analyzing",
  "manifest_review",
  "producing",
]);

const STATIC_AD_ACTIVE_STATUSES = new Set([
  "uploading",
  "analyzing",
  "analyzed",
  "confirmed",
  "generating",
]);

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function DashboardPage() {
  const router = useRouter();

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
  });

  const { data: staticAds, isLoading: loadingAds } = useQuery<
    StaticAdJobSummary[]
  >({
    queryKey: ["static-ad-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/static-ads");
      if (!res.ok) throw new Error("Failed to load static ads");
      return res.json();
    },
  });

  const isLoading = loadingProjects || loadingAds;

  // Merge into unified activity list
  const activity: ActivityItem[] = [];

  if (projects) {
    for (const p of projects) {
      const pt = (p as Project & { projectType?: string }).projectType;
      let href: string;
      if (pt === "concept") {
        href =
          p.status === "producing" || p.status === "complete"
            ? `/projects/${p.id}/production`
            : `/projects/${p.id}/concept`;
      } else {
        href = `/projects/${p.id}/upload`;
      }
      activity.push({
        type: "video",
        name: p.name,
        status: p.status,
        createdAt: p.createdAt as unknown as string,
        href,
      });
    }
  }

  if (staticAds) {
    for (const ad of staticAds) {
      activity.push({
        type: "static-ad",
        name: ad.productName ?? "Untitled Ad",
        status: ad.status,
        createdAt: ad.createdAt,
        href: `/static-ads/${ad.id}`,
      });
    }
  }

  // Sort by createdAt descending
  activity.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const recentActivity = activity.slice(0, 10);

  const activeJobs = activity.filter((item) =>
    item.type === "video"
      ? VIDEO_ACTIVE_STATUSES.has(item.status)
      : STATIC_AD_ACTIVE_STATUSES.has(item.status)
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#fafafa]">
          Command Center
        </h1>
        <p className="text-sm text-[#71717a] mt-0.5">
          Your creative production hub
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => router.push("/projects")}
          className={cn(
            "bg-[#18181b] border border-[#27272a] rounded-xl p-6",
            "hover:border-[#3f3f46] transition-all cursor-pointer text-left group"
          )}
        >
          <Film className="h-6 w-6 text-[#a1a1aa] mb-3 group-hover:text-[#fafafa] transition-colors" />
          <p className="text-sm font-medium text-[#fafafa]">
            New Video Project
          </p>
          <p className="text-xs text-[#71717a] mt-1">
            Create an AI-generated branded video
          </p>
        </button>

        <button
          onClick={() => router.push("/static-ads")}
          className={cn(
            "bg-[#18181b] border border-[#27272a] rounded-xl p-6",
            "hover:border-[#3f3f46] transition-all cursor-pointer text-left group"
          )}
        >
          <ImagePlus className="h-6 w-6 text-[#a1a1aa] mb-3 group-hover:text-[#fafafa] transition-colors" />
          <p className="text-sm font-medium text-[#fafafa]">New Static Ad</p>
          <p className="text-xs text-[#71717a] mt-1">
            Generate a static ad from a product photo
          </p>
        </button>
      </div>

      {/* Active Jobs */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-[#fafafa] mb-3">
          Active Jobs
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : activeJobs.length === 0 ? (
          <p className="text-sm text-[#71717a] py-4">No active jobs</p>
        ) : (
          <div className="space-y-2">
            {activeJobs.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border border-[#27272a] bg-[#18181b]",
                  "hover:border-[#3f3f46] transition-all text-left group"
                )}
              >
                <div className="relative flex items-center justify-center">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full animate-pulse",
                      item.type === "video"
                        ? VIDEO_STATUS_COLORS[item.status] ?? "bg-[#52525b]"
                        : STATIC_AD_STATUS_COLORS[item.status] ?? "bg-[#52525b]"
                    )}
                  />
                </div>
                {item.type === "video" ? (
                  <Film className="h-4 w-4 text-[#52525b] shrink-0" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-[#52525b] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#fafafa] truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-[#71717a] mt-0.5">
                    {item.status.replace(/_/g, " ")}
                  </p>
                </div>
                <span className="text-xs text-[#52525b]">
                  {relativeTime(item.createdAt)}
                </span>
                <ChevronRight className="h-4 w-4 text-[#52525b] group-hover:text-[#a1a1aa] shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-medium text-[#fafafa] mb-3">
          Recent Activity
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <p className="text-sm text-[#71717a] py-4">No activity yet</p>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border border-[#27272a] bg-[#18181b]",
                  "hover:border-[#3f3f46] transition-all text-left group"
                )}
              >
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full shrink-0",
                    item.type === "video"
                      ? VIDEO_STATUS_COLORS[item.status] ?? "bg-[#52525b]"
                      : STATIC_AD_STATUS_COLORS[item.status] ?? "bg-[#52525b]"
                  )}
                />
                {item.type === "video" ? (
                  <Film className="h-4 w-4 text-[#52525b] shrink-0" />
                ) : (
                  <ImagePlus className="h-4 w-4 text-[#52525b] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#fafafa] truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-[#71717a] mt-0.5 capitalize">
                    {item.status.replace(/_/g, " ")}
                  </p>
                </div>
                <span className="text-xs text-[#52525b]">
                  {relativeTime(item.createdAt)}
                </span>
                <ChevronRight className="h-4 w-4 text-[#52525b] group-hover:text-[#a1a1aa] shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
