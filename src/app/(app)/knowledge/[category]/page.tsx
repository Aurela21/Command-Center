"use client";

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { KnowledgeDocument } from "@/db/schema";
import type { SearchResult } from "@/app/api/knowledge/search/route";

// ─── Category metadata ───────────────────────────────────────────────────────

const CATEGORY_META: Record<
  string,
  { label: string; description: string; acceptTypes: string; isImageCategory: boolean }
> = {
  brand: {
    label: "Brand",
    description: "Brand guidelines, positioning, and identity assets",
    acceptTypes: ".pdf,.docx,.txt,.md",
    isImageCategory: false,
  },
  voice: {
    label: "Voice",
    description: "Tone of voice guides, communication style, and messaging frameworks",
    acceptTypes: ".pdf,.docx,.txt,.md",
    isImageCategory: false,
  },
  style: {
    label: "Style",
    description: "Visual style references, mood boards, and aesthetic direction",
    acceptTypes: ".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp",
    isImageCategory: true,
  },
  script_copy: {
    label: "Script Copy",
    description: "Winning ad scripts, direct response copy, and swipe files",
    acceptTypes: ".pdf,.docx,.txt,.md",
    isImageCategory: false,
  },
  kling_prompts: {
    label: "Kling Prompts",
    description: "Kling prompting best practices, templates, and example prompts",
    acceptTypes: ".pdf,.docx,.txt,.md",
    isImageCategory: false,
  },
  product_assets: {
    label: "Product Assets",
    description: "Product images for @tag references in seed generation",
    acceptTypes: ".jpg,.jpeg,.png,.webp,.pdf,.docx,.txt",
    isImageCategory: true,
  },
};

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <Check className="h-3 w-3" />
        Ready
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        Processing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
      <AlertCircle className="h-3 w-3" />
      Error
    </span>
  );
}

// ─── Upload zone ─────────────────────────────────────────────────────────────

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; progress: number }
  | { kind: "processing"; filename: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

function UploadZone({
  category,
  acceptTypes,
  onDone,
}: {
  category: string;
  acceptTypes: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startUpload(file);
    e.target.value = "";
  }

  async function startUpload(file: File) {
    setState({ kind: "uploading", filename: file.name, progress: 0 });

    try {
      // 1. Upload file through server (avoids R2 CORS issues)
      const uploadRes = await new Promise<{ key: string; fileType: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open(
            "POST",
            `/api/knowledge/upload?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || "application/octet-stream")}`
          );
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setState({
                kind: "uploading",
                filename: file.name,
                progress: Math.round((e.loaded / e.total) * 100),
              });
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(`Upload failed: ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(file);
        }
      );

      const { key, fileType } = uploadRes;

      // 2. Create document record with category
      setState({ kind: "processing", filename: file.name });
      const docRes = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, fileUrl: key, fileType, category }),
      });
      if (!docRes.ok) throw new Error("Failed to create document record");

      setState({ kind: "done" });
      onDone();
      setTimeout(() => setState({ kind: "idle" }), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setState({ kind: "error", message: msg });
      toast.error(msg);
    }
  }

  if (state.kind === "idle") {
    return (
      <div>
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          onClick={() => inputRef.current?.click()}
          className="gap-2 bg-[#6366f1] hover:bg-[#6366f1]/80 text-white h-9 text-sm"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </Button>
      </div>
    );
  }

  if (state.kind === "uploading") {
    return (
      <div className="flex items-center gap-3 text-sm text-[#a1a1aa]">
        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-blue-500" />
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-medium">{state.filename}</p>
          <div className="mt-1 h-1 bg-[#27272a] rounded-full overflow-hidden w-48">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${state.progress}%` }}
            />
          </div>
        </div>
        <span className="text-xs tabular-nums text-[#71717a] shrink-0">
          {state.progress}%
        </span>
      </div>
    );
  }

  if (state.kind === "processing") {
    return (
      <div className="flex items-center gap-2 text-sm text-[#a1a1aa]">
        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-blue-500" />
        <span className="text-xs">Processing...</span>
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Check className="h-4 w-4 shrink-0" />
        <span className="text-xs font-medium">Uploaded</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-red-500">
      <X className="h-4 w-4 shrink-0" />
      <span className="text-xs">
        {state.kind === "error" ? state.message : "Error"}
      </span>
      <button
        onClick={() => setState({ kind: "idle" })}
        className="text-xs underline hover:no-underline"
      >
        Try again
      </button>
    </div>
  );
}

// ─── Document list item ──────────────────────────────────────────────────────

function DocumentItem({
  doc,
  isImage,
  onDelete,
  onReprocess,
}: {
  doc: KnowledgeDocument;
  isImage: boolean;
  onDelete: (id: string) => void;
  onReprocess: (id: string) => void;
}) {
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1a1a1e] last:border-0 hover:bg-[#27272a] group transition-colors">
      <div className="shrink-0">
        <div className="w-9 h-9 rounded-lg bg-[#27272a] flex items-center justify-center">
          <Icon className="h-4 w-4 text-[#71717a]" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#fafafa] truncate">
          {doc.name}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <StatusBadge status={doc.status} />
          {doc.status === "ready" && doc.totalChunks != null && (
            <span className="text-[11px] text-[#71717a]">
              {doc.totalChunks} chunk{doc.totalChunks !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[11px] text-[#52525b]">
            {doc.fileType?.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {doc.status === "error" && (
          <button
            onClick={() => onReprocess(doc.id)}
            title="Retry processing"
            className="p-1.5 rounded text-[#71717a] hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(doc.id)}
          title="Delete document"
          className="p-1.5 rounded text-[#71717a] hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Search panel ────────────────────────────────────────────────────────────

function SearchPanel({ category }: { category: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), topK: 6, category }),
      });
      if (!res.ok) throw new Error("Search failed");
      setResults(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSearch} className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#71717a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this category..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-[#27272a] rounded-lg bg-[#09090b] text-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#27272a] focus:border-[#3f3f46] transition-all placeholder:text-[#71717a]"
          />
        </div>
        <Button
          type="submit"
          disabled={searching || !query.trim()}
          variant="outline"
          className="h-9 px-4 text-sm gap-1.5"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto space-y-3">
        {results === null ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-8 w-8 text-[#52525b] mb-3" />
            <p className="text-sm text-[#71717a]">
              Search documents in this category
            </p>
          </div>
        ) : results.length === 0 ? (
          <p className="text-sm text-[#71717a] text-center py-10">
            No results found
          </p>
        ) : (
          results.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-[#1a1a1e] bg-[#18181b] p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#a1a1aa] truncate">
                    {r.documentName}
                  </p>
                  {r.sectionTitle && (
                    <p className="text-[11px] text-[#71717a] truncate">
                      {r.sectionTitle}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold tabular-nums shrink-0 px-2 py-0.5 rounded-full",
                    r.similarity >= 0.8
                      ? "bg-emerald-500/10 text-emerald-400"
                      : r.similarity >= 0.6
                      ? "bg-blue-500/10 text-blue-400"
                      : "bg-[#27272a] text-[#a1a1aa]"
                  )}
                >
                  {Math.round(r.similarity * 100)}%
                </span>
              </div>
              <p className="text-xs text-[#a1a1aa] leading-relaxed line-clamp-4">
                {r.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Category detail page ────────────────────────────────────────────────────

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const meta = CATEGORY_META[category] ?? {
    label: category,
    description: "",
    acceptTypes: ".pdf,.docx,.txt,.md",
    isImageCategory: false,
  };

  const { data: allDocuments = [], isLoading } = useQuery<
    (KnowledgeDocument & { category?: string })[]
  >({
    queryKey: ["knowledge-documents"],
    queryFn: async () => {
      const res = await fetch("/api/knowledge/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    refetchInterval: (query) => {
      const docs = query.state.data;
      return docs?.some(
        (d) => (d.category ?? "brand") === category && d.status === "processing"
      )
        ? 5000
        : false;
    },
  });

  const documents = allDocuments.filter(
    (d) => (d.category ?? "brand") === category
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/knowledge/documents/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["knowledge-documents"] }),
    onError: () => toast.error("Failed to delete document"),
  });

  const reprocessMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/knowledge/documents/${id}/process`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to reprocess");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-documents"] });
      toast.success("Reprocessing started");
    },
    onError: () => toast.error("Failed to start reprocessing"),
  });

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#18181b]">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b border-[#27272a]">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => router.push("/knowledge")}
              className="inline-flex items-center gap-1.5 text-xs text-[#71717a] hover:text-[#a1a1aa] transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Knowledge Base
            </button>
            <h1 className="text-base font-semibold text-[#fafafa]">
              {meta.label}
            </h1>
            <p className="text-xs text-[#71717a] mt-0.5">
              {meta.description}
              {!isLoading && (
                <>
                  {" "}&middot; {documents.length} document
                  {documents.length !== 1 ? "s" : ""}
                </>
              )}
            </p>
          </div>
          <UploadZone
            category={category}
            acceptTypes={meta.acceptTypes}
            onDone={() =>
              qc.invalidateQueries({ queryKey: ["knowledge-documents"] })
            }
          />
        </div>
      </div>

      {/* Content: two columns */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: document list */}
        <div className="w-80 shrink-0 border-r border-[#27272a] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-[#52525b]" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-[#27272a] flex items-center justify-center mb-3">
                <BookOpen className="h-6 w-6 text-[#52525b]" />
              </div>
              <p className="text-sm font-medium text-[#a1a1aa]">
                No documents yet
              </p>
              <p className="text-xs text-[#71717a] mt-1 leading-relaxed">
                Upload files to build this knowledge category
              </p>
            </div>
          ) : (
            documents.map((doc) => (
              <DocumentItem
                key={doc.id}
                doc={doc}
                isImage={meta.isImageCategory && /\.(jpg|jpeg|png|webp)$/i.test(doc.name)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onReprocess={(id) => reprocessMutation.mutate(id)}
              />
            ))
          )}
        </div>

        {/* Right: search */}
        <div className="flex-1 overflow-hidden px-8 py-6">
          <SearchPanel category={category} />
        </div>
      </div>
    </div>
  );
}
