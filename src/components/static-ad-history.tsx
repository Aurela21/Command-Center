"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight, Image } from "lucide-react";

type StaticAdJobSummary = {
  id: string;
  status: string;
  inputImageUrl: string | null;
  outputImageUrl: string | null;
  productName: string | null;
  createdAt: string;
  generationCount?: number;
};

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-neutral-300",
  analyzing: "bg-blue-400",
  analyzed: "bg-violet-400",
  confirmed: "bg-violet-400",
  generating: "bg-orange-400",
  completed: "bg-green-500",
  failed: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading",
  analyzing: "Analyzing",
  analyzed: "Ready for Review",
  confirmed: "Confirmed",
  generating: "Generating",
  completed: "Complete",
  failed: "Failed",
};

export function StaticAdHistory({
  jobs,
}: {
  jobs: StaticAdJobSummary[];
}) {
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-2xl bg-neutral-100 p-6 mb-4">
          <Image className="h-10 w-10 text-neutral-300" />
        </div>
        <p className="text-sm font-medium text-neutral-700">No static ads yet</p>
        <p className="text-sm text-neutral-400 mt-1">
          Create your first static ad to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <button
          key={job.id}
          onClick={() => router.push(`/static-ads/${job.id}`)}
          className={cn(
            "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-neutral-200 bg-white",
            "hover:border-neutral-300 hover:shadow-sm transition-all text-left group"
          )}
        >
          {/* Thumbnail */}
          <div className="h-12 w-12 rounded-lg bg-neutral-100 overflow-hidden shrink-0">
            {job.inputImageUrl ? (
              <img
                src={job.inputImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Image className="h-5 w-5 text-neutral-300" />
              </div>
            )}
          </div>

          {/* Status dot + info */}
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full shrink-0",
              STATUS_COLORS[job.status] ?? "bg-neutral-300"
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {job.productName ?? "No product"}
            </p>
            <p className="text-xs text-neutral-400 mt-0.5">
              {STATUS_LABELS[job.status] ?? job.status}
              {(job.generationCount ?? 0) > 0 && (
                <span className="ml-1.5 text-neutral-500">
                  · {job.generationCount} version{job.generationCount !== 1 ? "s" : ""}
                </span>
              )}
              {" · "}
              {new Date(job.createdAt).toLocaleDateString()}
            </p>
          </div>

          <ChevronRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-500 shrink-0 transition-colors" />
        </button>
      ))}
    </div>
  );
}
