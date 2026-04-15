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
import { toast } from "sonner";
import { StaticAdHistory } from "@/components/static-ad-history";
import type { ProductProfile } from "@/db/schema";

type StaticAdJobSummary = {
  id: string;
  status: string;
  inputImageUrl: string | null;
  outputImageUrl: string | null;
  productName: string | null;
  createdAt: string;
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await fetch("/api/static-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (!res.ok) throw new Error("Failed to create job");
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ["static-ad-jobs"] });
      setDialogOpen(false);
      setSelectedProductId("");
      router.push(`/static-ads/${job.id}`);
    },
    onError: () => toast.error("Failed to create static ad job"),
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
          <h1 className="text-xl font-semibold text-neutral-900">Static Ads</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {isLoading
              ? ""
              : `${jobs?.length ?? 0} ad${jobs?.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button
          onClick={() => {
            setSelectedProductId("");
            setDialogOpen(true);
          }}
          className="bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
        >
          <ImagePlus className="h-4 w-4" />
          New Ad
        </Button>
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <StaticAdHistory jobs={jobs ?? []} />
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
                  className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">Select a product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {products.length === 0 && (
                  <p className="text-xs text-neutral-400">
                    No products found. Add products in the Knowledge Base first.
                  </p>
                )}
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
                className="bg-neutral-900 hover:bg-neutral-700 text-white"
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
