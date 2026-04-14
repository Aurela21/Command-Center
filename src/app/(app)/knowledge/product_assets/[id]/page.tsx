"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Check,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductProfile, ProductImage } from "@/db/schema";

type ProfileWithImages = ProductProfile & { images: ProductImage[] };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null); // filename or null
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [descInput, setDescInput] = useState<string | null>(null);

  const { data: product, isLoading } = useQuery<ProfileWithImages>({
    queryKey: ["product", id],
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error("Failed to fetch product");
      return res.json();
    },
  });

  // ── Upload image ──────────────────────────────────────────────────────────

  async function handleUpload(file: File) {
    setUploading(file.name);
    try {
      const res = await fetch(
        `/api/products/${id}/images?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || "image/jpeg")}`,
        { method: "POST", body: file }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Upload failed");
      }
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Image uploaded and labeled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    // Upload all selected files sequentially
    (async () => {
      for (const file of Array.from(files)) {
        await handleUpload(file);
      }
    })();
    e.target.value = "";
  }

  // ── Update label ──────────────────────────────────────────────────────────

  const labelMutation = useMutation({
    mutationFn: async ({ imageId, label }: { imageId: string; label: string }) => {
      const res = await fetch(`/api/products/${id}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, label }),
      });
      if (!res.ok) throw new Error("Failed to update label");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      setEditingLabel(null);
    },
    onError: () => toast.error("Failed to update label"),
  });

  // ── Delete image ──────────────────────────────────────────────────────────

  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const res = await fetch(`/api/products/${id}/images`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId }),
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("Failed to delete image"),
  });

  // ── Update description ────────────────────────────────────────────────────

  const descMutation = useMutation({
    mutationFn: async (description: string) => {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) throw new Error("Failed to update");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product", id] });
      setDescInput(null);
    },
    onError: () => toast.error("Failed to update description"),
  });

  if (isLoading || !product) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-neutral-200">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push("/knowledge/product_assets")}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Product Assets
            </button>
            <h1 className="text-base font-semibold text-neutral-900">
              {product.name}
            </h1>
            <p className="text-[11px] font-mono text-orange-500 mt-0.5">
              @{product.slug}
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              onClick={() => inputRef.current?.click()}
              disabled={!!uploading}
              className="gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-9 text-sm"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading {uploading}...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5" />
                  Upload Photos
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl space-y-6">
          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-widest text-neutral-400">
                Product Description
              </p>
              {descInput === null && (
                <button
                  onClick={() => setDescInput(product.description ?? "")}
                  className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
            {descInput !== null ? (
              <div className="space-y-2">
                <textarea
                  value={descInput}
                  onChange={(e) => setDescInput(e.target.value)}
                  rows={3}
                  className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 focus:border-neutral-300 transition-all placeholder:text-neutral-400"
                  placeholder="Describe the product, its features, materials, colors..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => descMutation.mutate(descInput)}
                    disabled={descMutation.isPending}
                    className="h-7 text-xs bg-neutral-900 hover:bg-neutral-700 text-white"
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDescInput(null)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-600 leading-relaxed">
                {product.description || (
                  <span className="text-neutral-300 italic">
                    No description yet — add one to help Gemini understand the product
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Images */}
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 mb-3">
              Product Images ({product.images.length})
            </p>

            {product.images.length === 0 ? (
              <div className="border border-dashed border-neutral-200 rounded-xl p-10 text-center">
                <Upload className="h-8 w-8 text-neutral-200 mx-auto mb-3" />
                <p className="text-sm text-neutral-400">
                  Upload product photos from multiple angles
                </p>
                <p className="text-xs text-neutral-300 mt-1">
                  Claude will auto-label each image. You can edit labels after.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {product.images.map((img) => {
                  const isEditing = editingLabel === img.id;
                  return (
                    <div
                      key={img.id}
                      className="rounded-xl border border-neutral-100 overflow-hidden group"
                    >
                      <div className="aspect-square relative bg-neutral-50">
                        <img
                          src={img.fileUrl}
                          alt={img.label}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <button
                          onClick={() => deleteImageMutation.mutate(img.id)}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="px-3 py-2.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={labelInput}
                              onChange={(e) => setLabelInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && labelInput.trim()) {
                                  labelMutation.mutate({
                                    imageId: img.id,
                                    label: labelInput,
                                  });
                                }
                                if (e.key === "Escape") setEditingLabel(null);
                              }}
                              autoFocus
                              className="flex-1 text-xs border border-neutral-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-neutral-300"
                            />
                            <button
                              onClick={() => {
                                if (labelInput.trim()) {
                                  labelMutation.mutate({
                                    imageId: img.id,
                                    label: labelInput,
                                  });
                                }
                              }}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingLabel(null)}
                              className="p-1 text-neutral-400 hover:bg-neutral-100 rounded transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-neutral-700">
                              {img.label}
                            </span>
                            <button
                              onClick={() => {
                                setEditingLabel(img.id);
                                setLabelInput(img.label);
                              }}
                              className="p-1 text-neutral-300 hover:text-neutral-600 transition-colors"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {img.autoLabeled && img.label !== img.autoLabeled && (
                          <p className="text-[10px] text-neutral-300 mt-0.5">
                            Auto: {img.autoLabeled}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
