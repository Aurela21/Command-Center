"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Megaphone,
  Mic,
  Palette,
  FileText,
  Clapperboard,
  ShoppingBag,
  Loader2,
} from "lucide-react";
import type { KnowledgeDocument } from "@/db/schema";

// ─── Category config ─────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: "brand",
    label: "Brand",
    description: "Brand guidelines, positioning, and identity assets",
    icon: Megaphone,
    color: "bg-blue-50 text-blue-600 border-blue-100",
    iconBg: "bg-blue-100",
  },
  {
    id: "voice",
    label: "Voice",
    description: "Tone of voice guides, communication style, and messaging frameworks",
    icon: Mic,
    color: "bg-violet-50 text-violet-600 border-violet-100",
    iconBg: "bg-violet-100",
  },
  {
    id: "style",
    label: "Style",
    description: "Visual style references, mood boards, and aesthetic direction",
    icon: Palette,
    color: "bg-amber-50 text-amber-600 border-amber-100",
    iconBg: "bg-amber-100",
  },
  {
    id: "script_copy",
    label: "Script Copy",
    description: "Winning ad scripts, direct response copy, and swipe files",
    icon: FileText,
    color: "bg-emerald-50 text-emerald-600 border-emerald-100",
    iconBg: "bg-emerald-100",
  },
  {
    id: "kling_prompts",
    label: "Kling Prompts",
    description: "Kling prompting best practices, templates, and example prompts",
    icon: Clapperboard,
    color: "bg-rose-50 text-rose-600 border-rose-100",
    iconBg: "bg-rose-100",
  },
  {
    id: "product_assets",
    label: "Product Assets",
    description: "Product images and descriptions for @tag references in seed generation",
    icon: ShoppingBag,
    color: "bg-orange-50 text-orange-600 border-orange-100",
    iconBg: "bg-orange-100",
  },
] as const;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const router = useRouter();

  const { data: documents = [], isLoading } = useQuery<KnowledgeDocument[]>({
    queryKey: ["knowledge-documents"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
  });

  // Count docs per category
  const counts: Record<string, { total: number; ready: number; processing: number }> = {};
  for (const cat of CATEGORIES) {
    counts[cat.id] = { total: 0, ready: 0, processing: 0 };
  }
  for (const doc of documents) {
    const cat = (doc as KnowledgeDocument & { category?: string }).category ?? "brand";
    if (!counts[cat]) counts[cat] = { total: 0, ready: 0, processing: 0 };
    counts[cat].total++;
    if (doc.status === "ready") counts[cat].ready++;
    if (doc.status === "processing") counts[cat].processing++;
  }

  const totalDocs = documents.length;
  const totalReady = documents.filter((d) => d.status === "ready").length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="shrink-0 px-8 py-6 border-b border-neutral-200">
        <h1 className="text-base font-semibold text-neutral-900">
          Knowledge Base
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          {isLoading ? (
            "Loading..."
          ) : (
            <>
              {totalDocs} document{totalDocs !== 1 ? "s" : ""} across{" "}
              {Object.values(counts).filter((c) => c.total > 0).length} categories
              {" "}&middot; {totalReady} ready
            </>
          )}
        </p>
      </div>

      {/* Category grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-300" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {CATEGORIES.map((cat) => {
              const c = counts[cat.id];
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  onClick={() => router.push(`/knowledge/${cat.id}`)}
                  className={`text-left rounded-xl border p-5 transition-all hover:shadow-md hover:-translate-y-0.5 ${cat.color}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-10 h-10 rounded-lg ${cat.iconBg} flex items-center justify-center`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{cat.label}</p>
                      <p className="text-xs opacity-70 mt-0.5 leading-relaxed line-clamp-2">
                        {cat.description}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs font-medium tabular-nums">
                          {c.total} doc{c.total !== 1 ? "s" : ""}
                        </span>
                        {c.processing > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px]">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            {c.processing} processing
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
