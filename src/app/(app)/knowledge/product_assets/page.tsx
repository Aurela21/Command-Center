"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Package,
  PlusCircle,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { ProductProfile } from "@/db/schema";

export default function ProductAssetsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: products = [], isLoading } = useQuery<ProductProfile[]>({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create");
      }
      return res.json() as Promise<ProductProfile>;
    },
    onSuccess: (product) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      router.push(`/knowledge/product_assets/${product.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
    onError: () => toast.error("Failed to delete product"),
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-neutral-200">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push("/knowledge")}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Knowledge Base
            </button>
            <h1 className="text-base font-semibold text-neutral-900">
              Product Assets
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Product profiles with labeled images for @tag references in seed
              generation
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            New Product
          </Button>
        </div>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
              <ShoppingBag className="h-7 w-7 text-orange-400" />
            </div>
            <p className="text-sm font-medium text-neutral-600">
              No product profiles yet
            </p>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs leading-relaxed">
              Create a product profile and upload photos from multiple angles.
              Use @product-name in seed prompts to reference them.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              variant="outline"
              className="mt-4 gap-2 text-sm"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Create first product
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {products.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  router.push(`/knowledge/product_assets/${p.id}`)
                }
                className="text-left rounded-xl border border-neutral-100 bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                      <Package className="h-5 w-5 text-orange-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-800 truncate">
                        {p.name}
                      </p>
                      <p className="text-[11px] font-mono text-orange-500 mt-0.5">
                        @{p.slug}
                      </p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {p.imageCount ?? 0} image
                        {(p.imageCount ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(p.id);
                    }}
                    className="p-1.5 rounded text-neutral-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {p.description && (
                  <p className="text-xs text-neutral-400 mt-2 line-clamp-2 leading-relaxed">
                    {p.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Product Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">
                Product Name
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Airplane Hoodie"
                className="h-9"
              />
              {newName.trim() && (
                <p className="text-[11px] font-mono text-orange-500">
                  @tag:{" "}
                  {newName
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-500">
                Description
              </label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Oversized cream zip-up hoodie with built-in eye mask and zipper arm pockets..."
                rows={3}
                className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 transition-all placeholder:text-neutral-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              className="bg-neutral-900 hover:bg-neutral-700 text-white"
            >
              {createMutation.isPending ? "Creating..." : "Create & Upload Photos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
