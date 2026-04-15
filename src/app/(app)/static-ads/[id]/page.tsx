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
      // Poll every 3s while analyzing or generating
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

  // Track all generation output URLs (newest first)
  const [allOutputUrls, setAllOutputUrls] = useState<string[]>([]);

  // Sync from job data — add the current outputImageUrl if not already tracked
  useEffect(() => {
    if (job?.outputImageUrl) {
      setAllOutputUrls((prev) =>
        prev.includes(job.outputImageUrl!) ? prev : [job.outputImageUrl!, ...prev]
      );
    }
  }, [job?.outputImageUrl]);

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
          if (data.outputImageUrl) {
            setAllOutputUrls((prev) =>
              prev.includes(data.outputImageUrl) ? prev : [data.outputImageUrl, ...prev]
            );
          }
          qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
          setProgress(0);
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
      // Save final copy first
      await fetch(`/api/static-ads/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalCopy, status: "confirmed" }),
      });
      qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
      // Then trigger generation
      generateMutation.mutate(undefined);
    },
    [jobId, qc, generateMutation]
  );

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
        <p className="text-neutral-500">Job not found.</p>
      </div>
    );
  }

  const isAnalyzing =
    job.status === "analyzing" || analyzeMutation.isPending;
  const isGenerating =
    job.status === "generating" ||
    job.status === "confirmed" ||
    generateMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push("/static-ads")}
          className="text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">
            {job.productName ?? "Static Ad"}
          </h1>
          <p className="text-xs text-neutral-400">
            {STATUS_LABEL[job.status] ?? job.status}
            {progress > 0 && ` — ${progress}%`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Reference image */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">
            Reference Ad
          </h3>
          {job.inputImageUrl ? (
            <div className="rounded-xl border border-neutral-200 overflow-hidden bg-neutral-100">
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

          {/* Analyze button — show after upload, before analysis */}
          {job.inputImageUrl &&
            job.status === "uploading" &&
            !isAnalyzing && (
              <Button
                onClick={() => analyzeMutation.mutate()}
                className="w-full bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
              >
                <Scan className="h-4 w-4" />
                Analyze Ad
              </Button>
            )}

          {/* Analyzing spinner */}
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing ad psychology...
              {progress > 0 && <span className="text-xs">({progress}%)</span>}
            </div>
          )}
        </div>

        {/* Right: Stage-dependent content */}
        <div>
          {/* Analyzed — show analysis panel */}
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
              onCancel={handleCancel}
              isGenerating={isGenerating}
            />
          )}

          {/* Generating — progress */}
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <Loader2 className="h-10 w-10 text-neutral-400 animate-spin" />
              <p className="text-sm font-medium text-neutral-600">
                Generating your ad...
              </p>
              {progress > 0 && (
                <div className="w-48 bg-neutral-200 rounded-full h-1.5">
                  <div
                    className="bg-neutral-900 h-1.5 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-neutral-400">
                This may take up to a minute
              </p>
            </div>
          )}

          {/* Completed — show preview */}
          {job.status === "completed" &&
            job.outputImageUrl &&
            job.inputImageUrl && (
              <StaticAdPreview
                inputImageUrl={job.inputImageUrl}
                outputImageUrl={job.outputImageUrl}
                allOutputUrls={allOutputUrls}
                onRegenerate={(editPrompt) => generateMutation.mutate(editPrompt)}
                isRegenerating={generateMutation.isPending}
                products={productTags}
              />
            )}

          {/* Failed — error + retry */}
          {job.status === "failed" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm font-medium">Generation Failed</span>
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

          {/* Uploading — waiting for image */}
          {job.status === "uploading" && !job.inputImageUrl && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-neutral-400">
                Upload a reference ad image to get started.
              </p>
            </div>
          )}
        </div>
      </div>
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
