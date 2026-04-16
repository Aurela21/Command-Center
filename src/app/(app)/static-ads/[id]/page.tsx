"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Scan,
  Plus,
  X,
  ImagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { StaticAdUpload } from "@/components/static-ad-upload";
import { PsychAnalysisPanel } from "@/components/psych-analysis-panel";
import { StaticAdPreview } from "@/components/static-ad-preview";
import type { StaticAdAnalysis } from "@/lib/claude";
import type { ProductTag } from "@/app/(app)/projects/[id]/production/tab-3a";
import type { ProductProfile } from "@/db/schema";

type AdCopy = { headline: string; body: string; cta: string };

type StaticAdJobDetail = {
  id: string;
  status: string;
  productId: string | null;
  inputImageUrl: string | null;
  psychAnalysis: StaticAdAnalysis | null;
  extractedCopy: AdCopy | null;
  finalCopy: AdCopy | null;
  outputImageUrl: string | null;
  outputFileSizeBytes: number | null;
  generationPrompt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  productName: string | null;
  productSlug: string | null;
};

export default function StaticAdJobPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const jobId = typeof params?.id === "string" ? params.id : "";

  const { data: job, isLoading } = useQuery<StaticAdJobDetail>({
    queryKey: ["static-ad-job", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/static-ads/${jobId}`);
      if (!res.ok) throw new Error("Failed to load job");
      return res.json();
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "analyzing" || status === "generating") return 3000;
      return false;
    },
  });

  // Fetch products for @mention typeahead
  const { data: products = [] } = useQuery<ProductProfile[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const productTags: ProductTag[] = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    imageCount: p.imageCount ?? 0,
  }));

  // "New round" — user wants to upload a different reference image
  const [newRoundActive, setNewRoundActive] = useState(false);
  // Track whether there are existing generations (to know if this is first run or new round)
  const hasGenerations = !!job?.outputImageUrl;

  // SSE listener for real-time progress
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!jobId) return;

    const es = new EventSource(`/api/events`);
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.jobId !== jobId) return;

        if (data.type === "static-ad:progress") {
          setProgress(data.progress);
        } else if (data.type === "static-ad:completed") {
          qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
          qc.invalidateQueries({
            queryKey: ["static-ad-generations", jobId],
          });
          setProgress(0);
          setNewRoundActive(false);
        } else if (data.type === "static-ad:failed") {
          qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
          setProgress(0);
          toast.error(data.error);
        }
      } catch {}
    };

    es.addEventListener("message", handler);
    return () => {
      es.removeEventListener("message", handler);
      es.close();
    };
  }, [jobId, qc]);

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/static-ads/${jobId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Analysis failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
    },
    onError: (err) => toast.error(err.message),
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (editPrompt?: string) => {
      const res = await fetch(`/api/static-ads/${jobId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editPrompt: editPrompt || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generation failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
      qc.invalidateQueries({
        queryKey: ["static-ad-generations", jobId],
      });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUploadComplete = useCallback(
    (fileUrl: string) => {
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
    },
    [qc, jobId]
  );

  const handleConfirmAndGenerate = useCallback(
    async (finalCopy: AdCopy) => {
      await fetch(`/api/static-ads/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalCopy, status: "confirmed" }),
      });
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
      generateMutation.mutate(undefined);
    },
    [jobId, qc, generateMutation]
  );

  const handleStartNewRound = useCallback(async () => {
    // Reset job to uploading state with cleared image + analysis
    await fetch(`/api/static-ads/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "uploading",
        inputImageUrl: null,
        psychAnalysis: null,
        extractedCopy: null,
        finalCopy: null,
      }),
    });
    qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
    setNewRoundActive(true);
  }, [jobId, qc]);

  const handleCancelNewRound = useCallback(async () => {
    // If there are existing generations, restore to completed
    if (hasGenerations) {
      await fetch(`/api/static-ads/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
    }
    setNewRoundActive(false);
  }, [jobId, qc, hasGenerations]);

  const handleCancel = useCallback(() => {
    router.push("/static-ads");
  }, [router]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid grid-cols-2 gap-8">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-10">
        <p className="text-[#a1a1aa]">Job not found.</p>
      </div>
    );
  }

  const isAnalyzing =
    job.status === "analyzing" || analyzeMutation.isPending;
  const isGenerating =
    job.status === "generating" ||
    job.status === "confirmed" ||
    generateMutation.isPending;

  // Determine if we should show the upload/analyze/generate flow
  const showFlow =
    !hasGenerations || // first time
    newRoundActive || // user clicked "New Reference Ad"
    job.status === "uploading" ||
    job.status === "analyzing" ||
    job.status === "analyzed" ||
    (job.status === "generating" && !hasGenerations);

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/static-ads")}
          className="text-[#71717a] hover:text-[#a1a1aa] transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-[#fafafa]">
            {job.productName ?? "Static Ad"}
          </h1>
          <p className="text-xs text-[#71717a]">
            {STATUS_LABEL[job.status] ?? job.status}
            {progress > 0 && ` — ${progress}%`}
          </p>
        </div>
        {/* "New Reference Ad" button — show when completed and not already in a new round */}
        {job.status === "completed" && !newRoundActive && (
          <Button
            onClick={handleStartNewRound}
            variant="outline"
            className="gap-2"
          >
            <ImagePlus className="h-4 w-4" />
            New Reference Ad
          </Button>
        )}
      </div>

      {/* New round flow panel */}
      {showFlow && (
        <div
          className={cn(
            "mb-8",
            hasGenerations &&
              "rounded-xl border border-[#27272a] bg-[#09090b] p-6"
          )}
        >
          {hasGenerations && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#fafafa]">
                New Reference Ad
              </h3>
              <button
                onClick={handleCancelNewRound}
                className="text-[#71717a] hover:text-[#a1a1aa] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Reference image / upload */}
            <div className="space-y-4">
              {!hasGenerations && (
                <h3 className="text-sm font-semibold text-[#fafafa]">
                  Reference Ad
                </h3>
              )}
              {job.inputImageUrl ? (
                <div className="rounded-xl border border-[#27272a] overflow-hidden bg-[#18181b]">
                  <img
                    src={job.inputImageUrl}
                    alt="Reference ad"
                    className="w-full h-auto object-contain"
                  />
                </div>
              ) : (
                <StaticAdUpload
                  jobId={jobId}
                  onUploaded={handleUploadComplete}
                />
              )}

              {job.inputImageUrl &&
                job.status === "uploading" &&
                !isAnalyzing && (
                  <Button
                    onClick={() => analyzeMutation.mutate()}
                    className="w-full bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-2"
                  >
                    <Scan className="h-4 w-4" />
                    Analyze Ad
                  </Button>
                )}

              {isAnalyzing && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing ad psychology...
                  {progress > 0 && (
                    <span className="text-xs">({progress}%)</span>
                  )}
                </div>
              )}
            </div>

            {/* Right: Stage-dependent content */}
            <div>
              {job.status === "analyzed" && job.psychAnalysis && (
                <PsychAnalysisPanel
                  analysis={job.psychAnalysis}
                  extractedCopy={
                    (job.extractedCopy as AdCopy) ??
                    job.psychAnalysis.extractedCopy ?? {
                      headline: "",
                      body: "",
                      cta: "",
                    }
                  }
                  onConfirm={handleConfirmAndGenerate}
                  onCancel={
                    hasGenerations ? handleCancelNewRound : handleCancel
                  }
                  isGenerating={isGenerating}
                />
              )}

              {isGenerating && (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <Loader2 className="h-10 w-10 text-[#71717a] animate-spin" />
                  <p className="text-sm font-medium text-[#a1a1aa]">
                    Generating your ad...
                  </p>
                  {progress > 0 && (
                    <div className="w-48 bg-[#27272a] rounded-full h-1.5">
                      <div
                        className="bg-[#6366f1] h-1.5 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-[#71717a]">
                    This may take up to a minute
                  </p>
                </div>
              )}

              {job.status === "failed" && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Generation Failed
                    </span>
                  </div>
                  <p className="text-sm text-red-500">{job.lastError}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (job.psychAnalysis) {
                        generateMutation.mutate(undefined);
                      } else {
                        analyzeMutation.mutate();
                      }
                    }}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              )}

              {job.status === "uploading" && !job.inputImageUrl && !hasGenerations && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm text-[#71717a]">
                    Upload a reference ad image to get started.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generations preview — always visible when there are generations */}
      {hasGenerations && (
        <StaticAdPreview
          jobId={jobId}
          inputImageUrl={job.inputImageUrl ?? ""}
          productSlug={job.productSlug ?? "static-ad"}
          onRegenerate={(editPrompt) => generateMutation.mutate(editPrompt)}
          isRegenerating={generateMutation.isPending}
          products={productTags}
        />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  uploading: "Waiting for upload",
  analyzing: "Analyzing...",
  analyzed: "Analysis complete",
  confirmed: "Confirmed",
  generating: "Generating...",
  completed: "Complete",
  failed: "Failed",
};
