"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Download,
  RefreshCw,
  PenLine,
  X,
  Maximize2,
  Star,
  Check,
  Loader2,
  HelpCircle,
  ChevronDown,
  Type,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { PromptWithMentions } from "@/app/(app)/projects/[id]/production/tab-3a";
import type { ProductTag } from "@/app/(app)/projects/[id]/production/tab-3a";

type Generation = {
  id: string;
  jobId: string;
  versionNumber: number;
  imageUrl: string;
  referenceImageUrl: string | null;
  fileSizeBytes: number | null;
  generationPrompt: string | null;
  editPrompt: string | null;
  isFavorite: boolean;
  createdAt: string;
};

// ─── Lightbox ───────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt="Expanded view"
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  return b < 1e6
    ? `${(b / 1024).toFixed(0)} KB`
    : `${(b / 1e6).toFixed(1)} MB`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function StaticAdPreview({
  jobId,
  inputImageUrl,
  productSlug,
  onRegenerate,
  isRegenerating,
  products,
}: {
  jobId: string;
  inputImageUrl: string;
  productSlug: string;
  onRegenerate: (editPrompt?: string) => void;
  isRegenerating: boolean;
  products: ProductTag[];
}) {
  const qc = useQueryClient();

  // Fetch generations
  const { data: generations = [] } = useQuery<Generation[]>({
    queryKey: ["static-ad-generations", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/static-ads/${jobId}/generations`);
      if (!res.ok) throw new Error("Failed to load generations");
      return res.json();
    },
  });

  // Fetch job for current copy + product
  const { data: jobData } = useQuery<{
    productId: string | null;
    finalCopy: { headline: string; body: string; cta: string } | null;
    extractedCopy: { headline: string; body: string; cta: string } | null;
  }>({
    queryKey: ["static-ad-job", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/static-ads/${jobId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const currentCopy = jobData?.finalCopy ?? jobData?.extractedCopy ?? null;
  const currentProductId = jobData?.productId ?? "";

  // State
  const [viewedId, setViewedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSynced, setProductSynced] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("");
  const [copySynced, setCopySynced] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Sync product from server data once
  useEffect(() => {
    if (currentProductId && !productSynced) {
      setSelectedProductId(currentProductId);
      setProductSynced(true);
    }
  }, [currentProductId, productSynced]);

  // Sync copy fields from server data once
  useEffect(() => {
    if (currentCopy && !copySynced) {
      setHeadline(currentCopy.headline);
      setBody(currentCopy.body);
      setCta(currentCopy.cta);
      setCopySynced(true);
    }
  }, [currentCopy, copySynced]);

  // Fetch full product profiles (with IDs) for the product selector
  const { data: allProducts = [] } = useQuery<
    Array<{ id: string; name: string; slug: string }>
  >({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Default to newest generation
  useEffect(() => {
    if (generations.length > 0 && !viewedId) {
      setViewedId(generations[0].id);
    }
  }, [generations, viewedId]);

  // When a new generation appears, select it
  useEffect(() => {
    if (generations.length > 0 && isRegenerating === false) {
      setViewedId(generations[0].id);
    }
  }, [generations.length, isRegenerating]);

  const viewed = generations.find((g) => g.id === viewedId) ?? generations[0];
  const filtered = filterFavorites
    ? generations.filter((g) => g.isFavorite)
    : generations;

  // Favorite toggle mutation
  const favMutation = useMutation({
    mutationFn: async ({
      genId,
      isFavorite,
    }: {
      genId: string;
      isFavorite: boolean;
    }) => {
      const res = await fetch(
        `/api/static-ads/${jobId}/generations/${genId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFavorite }),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["static-ad-generations", jobId],
      });
    },
  });

  // Selection helpers
  const toggleSelect = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    []
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map((g) => g.id)));
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  // Navigate
  const navigate = useCallback(
    (dir: -1 | 1) => {
      if (!viewed) return;
      const idx = filtered.findIndex((g) => g.id === viewed.id);
      const next = filtered[idx + dir];
      if (next) setViewedId(next.id);
    },
    [viewed, filtered]
  );

  // Download zip
  const handleDownloadZip = useCallback(async () => {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/static-ads/${jobId}/generations/download-zip`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationIds: Array.from(selected),
          }),
        }
      );
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `static-ads-${productSlug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Failed to download zip");
    } finally {
      setDownloading(false);
    }
  }, [selected, jobId, productSlug]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      if (e.key === "a" && !e.shiftKey) {
        e.preventDefault();
        selectAll();
      } else if (e.key === "A" && e.shiftKey) {
        e.preventDefault();
        deselectAll();
      } else if (e.key === "f" && viewed) {
        e.preventDefault();
        favMutation.mutate({
          genId: viewed.id,
          isFavorite: !viewed.isFavorite,
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      } else if (e.key === "d" && viewed) {
        e.preventDefault();
        const a = document.createElement("a");
        a.href = viewed.imageUrl;
        a.download = `${productSlug}-v${viewed.versionNumber}.jpg`;
        a.target = "_blank";
        a.click();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectAll,
    deselectAll,
    navigate,
    viewed,
    favMutation,
    productSlug,
  ]);

  if (!viewed) return null;

  return (
    <div className="space-y-4 relative">
      {/* Shortcuts tooltip */}
      <div className="absolute top-0 right-0">
        <div
          className="relative"
          onMouseEnter={() => setShowShortcuts(true)}
          onMouseLeave={() => setShowShortcuts(false)}
        >
          <HelpCircle className="h-4 w-4 text-[#52525b] hover:text-[#a1a1aa] cursor-help" />
          {showShortcuts && (
            <div className="absolute right-0 top-6 z-40 bg-neutral-900 text-white text-xs rounded-lg p-3 w-48 shadow-lg">
              <p className="font-medium mb-1.5">Keyboard Shortcuts</p>
              <div className="space-y-1 text-neutral-300">
                <p><kbd className="bg-neutral-700 px-1 rounded">a</kbd> Select all</p>
                <p><kbd className="bg-neutral-700 px-1 rounded">A</kbd> Deselect all</p>
                <p><kbd className="bg-neutral-700 px-1 rounded">f</kbd> Toggle favorite</p>
                <p><kbd className="bg-neutral-700 px-1 rounded">←</kbd> <kbd className="bg-neutral-700 px-1 rounded">→</kbd> Navigate</p>
                <p><kbd className="bg-neutral-700 px-1 rounded">d</kbd> Download current</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A) Main preview area */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
              Reference
            </p>
            {(viewed.referenceImageUrl || inputImageUrl) ? (
              <div
                className="relative rounded-lg border border-[#27272a] overflow-hidden bg-[#18181b] cursor-pointer group"
                onClick={() => setLightboxSrc(viewed.referenceImageUrl || inputImageUrl)}
              >
                <img
                  src={viewed.referenceImageUrl || inputImageUrl}
                  alt="Reference ad"
                  className="w-full h-auto object-contain"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-md" />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[#27272a] bg-[#18181b] h-48 flex items-center justify-center">
                <p className="text-xs text-[#71717a]">No reference</p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
              Generated
            </p>
            <div
              className="relative rounded-lg border border-[#27272a] overflow-hidden bg-[#18181b] cursor-pointer group"
              onClick={() => setLightboxSrc(viewed.imageUrl)}
            >
              <img
                src={viewed.imageUrl}
                alt="Generated ad"
                className="w-full h-auto object-contain"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Version info bar */}
        <div className="flex items-center gap-3 text-xs text-[#71717a]">
          <span className="font-medium text-[#a1a1aa]">
            v{viewed.versionNumber}
          </span>
          <span>{timeAgo(viewed.createdAt)}</span>
          {viewed.fileSizeBytes && (
            <span>{fmtBytes(viewed.fileSizeBytes)}</span>
          )}
          {viewed.editPrompt && (
            <span className="text-violet-500 truncate max-w-[200px]" title={viewed.editPrompt}>
              Edit: {viewed.editPrompt}
            </span>
          )}
          <button
            onClick={() =>
              favMutation.mutate({
                genId: viewed.id,
                isFavorite: !viewed.isFavorite,
              })
            }
            className="ml-auto"
          >
            <Star
              className={cn(
                "h-4 w-4 transition-colors",
                viewed.isFavorite
                  ? "fill-amber-400 text-amber-400"
                  : "text-[#52525b] hover:text-amber-400"
              )}
            />
          </button>
        </div>
      </div>

      {/* B) Generation thumbnail strip */}
      {generations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
              Generations ({generations.length})
            </p>
            <div className="flex bg-[#27272a] rounded-md p-0.5 text-xs">
              <button
                onClick={() => setFilterFavorites(false)}
                className={cn(
                  "px-2 py-0.5 rounded transition-colors",
                  !filterFavorites
                    ? "bg-[#18181b] text-[#fafafa] shadow-sm"
                    : "text-[#a1a1aa] hover:text-[#a1a1aa]"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilterFavorites(true)}
                className={cn(
                  "px-2 py-0.5 rounded transition-colors",
                  filterFavorites
                    ? "bg-[#18181b] text-[#fafafa] shadow-sm"
                    : "text-[#a1a1aa] hover:text-[#a1a1aa]"
                )}
              >
                Favorites
              </button>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            {/* Generating placeholder */}
            {isRegenerating && (
              <div className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-[#3f3f46] bg-[#09090b] flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-[#71717a] animate-spin" />
              </div>
            )}

            {filtered.map((gen) => (
              <div
                key={gen.id}
                className={cn(
                  "shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden bg-[#18181b] transition-all relative group cursor-pointer",
                  viewedId === gen.id
                    ? "border-[#6366f1] ring-1 ring-[#6366f1]"
                    : "border-[#27272a] hover:border-[#3f3f46]"
                )}
                onClick={() => setViewedId(gen.id)}
              >
                <img
                  src={gen.imageUrl}
                  alt={`v${gen.versionNumber}`}
                  className="w-full h-full object-cover"
                />

                {/* Checkbox — top-left */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(gen.id);
                  }}
                  className={cn(
                    "absolute top-1 left-1 h-4.5 w-4.5 rounded border flex items-center justify-center transition-all",
                    selected.has(gen.id)
                      ? "bg-[#6366f1] border-[#6366f1]"
                      : "bg-white/70 border-[#3f3f46] opacity-0 group-hover:opacity-100"
                  )}
                >
                  {selected.has(gen.id) && (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </button>

                {/* Favorite star — top-right */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    favMutation.mutate({
                      genId: gen.id,
                      isFavorite: !gen.isFavorite,
                    });
                  }}
                  className={cn(
                    "absolute top-1 right-1 transition-all",
                    gen.isFavorite
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <Star
                    className={cn(
                      "h-3.5 w-3.5 drop-shadow",
                      gen.isFavorite
                        ? "fill-amber-400 text-amber-400"
                        : "text-white hover:text-amber-400"
                    )}
                  />
                </button>

                {/* Version label — bottom-left */}
                <span className="absolute bottom-0 left-0 text-[10px] font-medium text-white bg-black/50 px-1 py-0.5 rounded-tr">
                  v{gen.versionNumber}
                </span>

                {/* Download — bottom-right */}
                <a
                  href={gen.imageUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-0.5 rounded-tl"
                >
                  <Download className="h-3 w-3 text-white" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* C) Action bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-[#71717a]">
          <span>
            {selected.size > 0
              ? `${selected.size} of ${generations.length} selected`
              : "None selected"}
          </span>
          <button
            onClick={selectAll}
            className="text-[#a1a1aa] hover:text-[#a1a1aa]"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-[#a1a1aa] hover:text-[#a1a1aa]"
          >
            Deselect All
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={selected.size === 0 || downloading}
          onClick={handleDownloadZip}
          className="gap-1.5 text-xs"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download Selected ({selected.size})
        </Button>
      </div>

      {/* D) Product selector + copy editor + edit instructions + regenerate */}
      <div className="space-y-3 rounded-xl border border-[#27272a] bg-[#18181b] p-4">
        {/* Collapsible product selector */}
        <button
          onClick={() => setProductOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left"
        >
          <Package className="h-3.5 w-3.5 text-[#71717a]" />
          <span className="text-xs font-medium text-[#a1a1aa] flex-1">
            Product
            {selectedProductId && (
              <span className="ml-1.5 text-[#71717a] font-normal">
                — {allProducts.find((p) => p.id === selectedProductId)?.name ?? ""}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[#71717a] transition-transform",
              !productOpen && "-rotate-90"
            )}
          />
        </button>
        {productOpen && (
          <div className="pt-1">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-[#27272a] bg-[#09090b] px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select a product...</option>
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Collapsible copy editor */}
        <button
          onClick={() => setCopyOpen((o) => !o)}
          className="flex items-center gap-2 w-full text-left border-t border-[#1a1a1e] pt-3"
        >
          <Type className="h-3.5 w-3.5 text-[#71717a]" />
          <span className="text-xs font-medium text-[#a1a1aa] flex-1">
            Ad Copy
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-[#71717a] transition-transform",
              !copyOpen && "-rotate-90"
            )}
          />
        </button>
        {copyOpen && (
          <div className="space-y-2.5 pt-1">
            <div className="space-y-1">
              <Label htmlFor="preview-headline" className="text-xs">
                Headline
              </Label>
              <Input
                id="preview-headline"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="bg-[#09090b] text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preview-body" className="text-xs">
                Body Copy
              </Label>
              <textarea
                id="preview-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                className={cn(
                  "flex w-full rounded-md border border-[#27272a] bg-[#09090b] px-3 py-2",
                  "text-sm placeholder:text-[#71717a]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "resize-none"
                )}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preview-cta" className="text-xs">
                CTA Text
              </Label>
              <Input
                id="preview-cta"
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                className="bg-[#09090b] text-sm"
              />
            </div>
          </div>
        )}

        {/* Edit instructions */}
        <div className="space-y-2 pt-1 border-t border-[#1a1a1e]">
          <div className="flex items-center gap-2 pt-2">
            <PenLine className="h-3.5 w-3.5 text-[#71717a]" />
            <span className="text-xs font-medium text-[#a1a1aa]">
              Edit Instructions
            </span>
          </div>
          <PromptWithMentions
            value={editPrompt}
            onChange={setEditPrompt}
            products={products}
            placeholder="Describe changes... e.g. 'remove text from the back of the product, show @my-product hood down'"
            rows={3}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            onClick={async () => {
              // Save product + copy if changed
              const copyChanged =
                headline !== (currentCopy?.headline ?? "") ||
                body !== (currentCopy?.body ?? "") ||
                cta !== (currentCopy?.cta ?? "");
              const productChanged =
                selectedProductId !== currentProductId;
              if (copyChanged || productChanged) {
                const patch: Record<string, unknown> = {};
                if (copyChanged)
                  patch.finalCopy = { headline, body, cta };
                if (productChanged)
                  patch.productId = selectedProductId || null;
                await fetch(`/api/static-ads/${jobId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patch),
                });
                qc.invalidateQueries({ queryKey: ["static-ad-job", jobId] });
              }
              onRegenerate(editPrompt.trim() || undefined);
            }}
            disabled={isRegenerating}
            className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`}
            />
            {editPrompt.trim() ? "Generate with Edits" : "Generate Another"}
          </Button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
