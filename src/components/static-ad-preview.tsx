"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Download, RefreshCw, PenLine, X, Maximize2 } from "lucide-react";
import { PromptWithMentions } from "@/app/(app)/projects/[id]/production/tab-3a";
import type { ProductTag } from "@/app/(app)/projects/[id]/production/tab-3a";

function Lightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
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

function ExpandableImage({
  src,
  alt,
  label,
}: {
  src: string;
  alt: string;
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="space-y-1.5">
        {label && (
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            {label}
          </p>
        )}
        <div
          className="relative rounded-lg border border-neutral-200 overflow-hidden bg-neutral-100 cursor-pointer group"
          onClick={() => setExpanded(true)}
        >
          <img src={src} alt={alt} className="w-full h-auto object-contain" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
            <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-md" />
          </div>
        </div>
      </div>
      {expanded && <Lightbox src={src} onClose={() => setExpanded(false)} />}
    </>
  );
}

export function StaticAdPreview({
  inputImageUrl,
  outputImageUrl,
  allOutputUrls,
  onRegenerate,
  isRegenerating,
  products,
}: {
  inputImageUrl: string;
  outputImageUrl: string;
  allOutputUrls: string[];
  onRegenerate: (editPrompt?: string) => void;
  isRegenerating: boolean;
  products: ProductTag[];
}) {
  const [editPrompt, setEditPrompt] = useState("");
  const [selectedUrl, setSelectedUrl] = useState(outputImageUrl);

  // When a new generation completes, select it
  useEffect(() => {
    setSelectedUrl(outputImageUrl);
  }, [outputImageUrl]);

  return (
    <div className="space-y-4">
      {/* Main comparison: reference vs selected generation */}
      <h3 className="text-sm font-semibold text-neutral-900">
        Result Comparison
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <ExpandableImage
          src={inputImageUrl}
          alt="Reference ad"
          label="Reference"
        />
        <ExpandableImage
          src={selectedUrl}
          alt="Generated ad"
          label="Generated"
        />
      </div>

      {/* Generation history */}
      {allOutputUrls.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
            All Generations ({allOutputUrls.length})
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {allOutputUrls.map((url, i) => (
              <button
                key={url}
                onClick={() => setSelectedUrl(url)}
                className={cn(
                  "shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden bg-neutral-100 transition-all",
                  selectedUrl === url
                    ? "border-neutral-900 ring-1 ring-neutral-900"
                    : "border-neutral-200 hover:border-neutral-400"
                )}
              >
                <img
                  src={url}
                  alt={`Generation ${allOutputUrls.length - i}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Download for selected */}
      <div className="flex gap-2">
        <a
          href={selectedUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" className="gap-2" size="sm">
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </a>
      </div>

      {/* Edit box */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <PenLine className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-xs font-medium text-neutral-500">
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
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => onRegenerate(editPrompt.trim() || undefined)}
            disabled={isRegenerating}
            className="bg-neutral-900 hover:bg-neutral-700 text-white gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} />
            {editPrompt.trim() ? "Regenerate with Edits" : "Regenerate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
