"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronRight, Copy, Image } from "lucide-react";

type StaticAdJobSummary = {
  id: string;
  status: string;
  inputImageUrl: string | null;
  outputImageUrl: string | null;
  productName: string | null;
  createdAt: string;
  generationCount?: number;
  sessionTag?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  uploading: "bg-[#52525b]",
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
  onDuplicate,
  groupBySession,
}: {
  jobs: StaticAdJobSummary[];
  onDuplicate: (jobId: string) => void;
  groupBySession?: boolean;
}) {
  const router = useRouter();

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-2xl bg-[#27272a] p-6 mb-4">
          <Image className="h-10 w-10 text-[#52525b]" />
        </div>
        <p className="text-sm font-medium text-[#a1a1aa]">No static ads yet</p>
        <p className="text-sm text-[#71717a] mt-1">
          Create your first static ad to get started.
        </p>
      </div>
    );
  }

  function renderCard(job: StaticAdJobSummary) {
    return (
      <button
        key={job.id}
        onClick={() => router.push(`/static-ads/${job.id}`)}
        className={cn(
          "w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-[#27272a] bg-[#18181b]",
          "hover:border-[#3f3f46] hover:shadow-sm transition-all text-left group"
        )}
      >
        {/* Thumbnail */}
        <div className="h-12 w-12 rounded-lg bg-[#27272a] overflow-hidden shrink-0">
          {job.inputImageUrl ? (
            <img
              src={job.inputImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Image className="h-5 w-5 text-[#52525b]" />
            </div>
          )}
        </div>

        {/* Status dot + info */}
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            STATUS_COLORS[job.status] ?? "bg-[#52525b]"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#fafafa] truncate">
            {job.productName ?? "No product"}
          </p>
          <p className="text-xs text-[#71717a] mt-0.5">
            {STATUS_LABELS[job.status] ?? job.status}
            {(job.generationCount ?? 0) > 0 && (
              <span className="ml-1.5 text-[#a1a1aa]">
                · {job.generationCount} version{job.generationCount !== 1 ? "s" : ""}
              </span>
            )}
            {" · "}
            {new Date(job.createdAt).toLocaleDateString()}
          </p>
        </div>

        {job.status === "completed" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(job.id);
            }}
            className="p-1.5 rounded-md text-[#52525b] hover:text-[#a1a1aa] hover:bg-[#27272a] transition-colors shrink-0"
            title="Duplicate"
          >
            <Copy className="h-4 w-4" />
          </button>
        )}

        <ChevronRight className="h-4 w-4 text-[#52525b] group-hover:text-[#a1a1aa] shrink-0 transition-colors" />
      </button>
    );
  }

  if (groupBySession) {
    const grouped: Record<string, StaticAdJobSummary[]> = {};
    for (const job of jobs) {
      const key = job.sessionTag || "__none__";
      (grouped[key] ??= []).push(job);
    }

    return (
      <div className="space-y-2">
        {Object.entries(grouped).map(([session, sessionJobs]) => (
          <div key={session}>
            <div className="flex items-center gap-2 mb-2 mt-4 first:mt-0">
              <div className="h-px flex-1 bg-[#27272a]" />
              <span className="text-xs text-[#71717a] font-medium shrink-0">
                {session === "__none__"
                  ? "No session"
                  : `${session} (${sessionJobs.length})`}
              </span>
              <div className="h-px flex-1 bg-[#27272a]" />
            </div>
            {sessionJobs.map((job) => renderCard(job))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => renderCard(job))}
    </div>
  );
}
