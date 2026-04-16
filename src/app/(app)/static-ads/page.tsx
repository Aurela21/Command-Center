"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StaticAdHistory } from "@/components/static-ad-history";
import type { ProductProfile } from "@/db/schema";

type StaticAdJobSummary = {
  id: string;
  status: string;
  inputImageUrl: string | null;
  outputImageUrl: string | null;
  productId: string | null;
  productName: string | null;
  createdAt: string;
  sessionTag?: string | null;
};

export default function StaticAdsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: jobs, isLoading } = useQuery<StaticAdJobSummary[]>({
    queryKey: ["static-ad-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/static-ads");
      if (!res.ok) throw new Error("Failed to load jobs");
      return res.json();
    },
  });

  const { data: products = [] } = useQuery<ProductProfile[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [sessionFilter, setSessionFilter] = useState<string>("all");

  const existingSessions = [
    ...new Set((jobs ?? []).map((j) => j.sessionTag).filter(Boolean)),
  ] as string[];

  const filtered = (jobs ?? []).filter((j) => {
    if (statusFilter === "complete" && j.status !== "completed") return false;
    if (statusFilter === "in-progress" && !["uploading", "analyzing", "analyzed", "confirmed", "generating"].includes(j.status)) return false;
    if (statusFilter === "failed" && j.status !== "failed") return false;
    if (productFilter !== "all" && j.productId !== productFilter) return false;
    if (sessionFilter === "none" && j.sessionTag) return false;
    if (sessionFilter !== "all" && sessionFilter !== "none" && j.sessionTag !== sessionFilter) return false;
    return true;
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [newSessionTag, setNewSessionTag] = useState("");

  const createMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch("/api/static-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          sessionTag: newSessionTag.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["static-ad-jobs"] });
      setDialogOpen(false);
      setSelectedProductId("");
      setNewSessionTag("");
      router.push(`/static-ads/${job.id}`);
    },
    onError: () => toast.error("Failed to create static ad job"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (sourceJobId: string) => {
      const res = await fetch("/api/static-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateFromId: sourceJobId }),
      });
      if (!res.ok) throw new Error("Failed to duplicate");
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["static-ad-jobs"] });
      router.push(`/static-ads/${job.id}`);
    },
    onError: () => toast.error("Failed to duplicate ad"),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProductId) return;
    createMutation.mutate(selectedProductId);
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-[#fafafa]">Static Ads</h1>
          <p className="text-sm text-[#71717a] mt-0.5">
            {isLoading
              ? ""
              : `${filtered.length} ad${filtered.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedProductId("");
            setDialogOpen(true);
          }}
          className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-2"
        >
          <ImagePlus className="h-4 w-4" />
          New Ad
        </Button>
      </div>

      {/* Filters */}
      {!isLoading && (jobs?.length ?? 0) > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1">
            {([
              { value: "all", label: "All" },
              { value: "complete", label: "Complete" },
              { value: "in-progress", label: "In Progress" },
              { value: "failed", label: "Failed" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  "text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
                  statusFilter === opt.value
                    ? "bg-[#6366f1] text-white"
                    : "bg-[#18181b] text-[#a1a1aa] border border-[#27272a] hover:border-[#3f3f46]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            <option value="all">All Sessions</option>
            {existingSessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="none">No Session</option>
          </select>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="bg-[#18181b] border border-[#27272a] text-[#a1a1aa] text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
          >
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Job list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (jobs?.length ?? 0) > 0 && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-[#a1a1aa]">No matching ads</p>
          <p className="text-sm text-[#71717a] mt-1">
            Try adjusting your filters.
          </p>
        </div>
      ) : (
        <StaticAdHistory
          jobs={filtered}
          onDuplicate={(id) => duplicateMutation.mutate(id)}
          groupBySession={sessionFilter === "all"}
        />
      )}

      {/* New Ad Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Static Ad</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product-select">Product</Label>
                <select
                  id="product-select"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-[#27272a] bg-[#18181b] px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {products.length === 0 && (
                  <p className="text-xs text-[#71717a]">
                    No products found. Add products in the Knowledge Base first.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-tag" className="text-[#a3a3a3]">
                  Session (optional)
                </Label>
                <input
                  id="session-tag"
                  list="session-suggestions"
                  value={newSessionTag}
                  onChange={(e) => setNewSessionTag(e.target.value)}
                  placeholder="e.g. Spring Campaign"
                  className="flex h-9 w-full rounded-md border border-[#27272a] bg-[#18181b] px-3 py-1.5 text-sm text-[#fafafa] placeholder:text-[#52525b] focus:border-[#6366f1] outline-none"
                />
                <datalist id="session-suggestions">
                  {existingSessions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
                disabled={!selectedProductId || createMutation.isPending}
                className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
