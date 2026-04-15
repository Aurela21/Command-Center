"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { PromptWithMentions, type ProductTag } from "../production/tab-3a";

type GeneratedScene = {
  sceneOrder: number;
  description: string;
  targetClipDurationS: number;
  klingPrompt: string;
  seedPrompt: string;
};

export default function ConceptPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [concept, setConcept] = useState("");
  const [generating, setGenerating] = useState(false);
  const [scenes, setScenes] = useState<GeneratedScene[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [proceeding, setProceeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch product tags for @mentions
  const [productTags, setProductTags] = useState<ProductTag[]>([]);
  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ slug: string; name: string; imageCount?: number }>) =>
        setProductTags(data.map((p) => ({ slug: p.slug, name: p.name, imageCount: p.imageCount ?? 0 })))
      )
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!concept.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-concept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept: concept.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(data.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      setScenes(data.scenes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }

  function updateScene(idx: number, patch: Partial<GeneratedScene>) {
    setScenes((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeScene(idx: number) {
    setScenes((prev) => {
      const filtered = prev.filter((_, i) => i !== idx);
      return filtered.map((s, i) => ({ ...s, sceneOrder: i + 1 }));
    });
  }

  function addScene() {
    setScenes((prev) => [
      ...prev,
      {
        sceneOrder: prev.length + 1,
        description: "",
        targetClipDurationS: 5,
        klingPrompt: "",
        seedPrompt: "",
      },
    ]);
    setEditingIdx(scenes.length);
  }

  async function handleProceed() {
    if (scenes.length === 0) return;
    setProceeding(true);
    try {
      // Scenes are already created in DB by generate-concept.
      // If user edited them, re-save via the generate-concept endpoint
      // or just update status to producing.
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "producing" }),
      });
      router.push(`/projects/${projectId}/production`);
    } catch {
      setProceeding(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-neutral-900">New Concept</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Describe your video concept and AI will generate a scene breakdown
        </p>
      </div>

      {/* Concept input */}
      <div className="mb-8 space-y-3">
        <PromptWithMentions
          value={concept}
          onChange={setConcept}
          products={productTags}
          rows={5}
          placeholder="Describe your video concept... e.g. '30 second DTC ad for the @airpplane-hoodie. Model walks through a city at golden hour, stops to show off the goggle hood feature, then the zipper arm pockets. Energetic music, quick cuts, ends with product hero shot.'"
        />
        <Button
          onClick={handleGenerate}
          disabled={generating || !concept.trim()}
          className="gap-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating scenes…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {scenes.length > 0 ? "Regenerate Scenes" : "Generate Scene Breakdown"}
            </>
          )}
        </Button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Generated scenes */}
      {scenes.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-700">
              {scenes.length} Scenes · {scenes.reduce((t, s) => t + s.targetClipDurationS, 0).toFixed(0)}s total
            </h2>
            <button
              onClick={addScene}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add scene
            </button>
          </div>

          <div className="space-y-3">
            {scenes.map((scene, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium text-neutral-400 tabular-nums">
                      Scene {String(scene.sceneOrder).padStart(2, "0")}
                    </span>
                    <span className="text-xs text-neutral-300">
                      · {scene.targetClipDurationS.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                      className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {scenes.length > 1 && (
                      <button
                        onClick={() => removeScene(idx)}
                        className="p-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {editingIdx === idx ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mb-1 block">
                        Description
                      </label>
                      <textarea
                        value={scene.description}
                        onChange={(e) => updateScene(idx, { description: e.target.value })}
                        rows={2}
                        className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2 bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_80px] gap-3">
                      <div>
                        <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mb-1 block">
                          Kling Prompt
                        </label>
                        <textarea
                          value={scene.klingPrompt}
                          onChange={(e) => updateScene(idx, { klingPrompt: e.target.value })}
                          rows={2}
                          className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2 bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mb-1 block">
                          Duration
                        </label>
                        <select
                          value={scene.targetClipDurationS}
                          onChange={(e) => updateScene(idx, { targetClipDurationS: parseFloat(e.target.value) })}
                          className="w-full text-sm rounded-md border border-neutral-200 px-2 py-2 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-200"
                        >
                          {[3, 4, 5, 6, 7].map((d) => (
                            <option key={d} value={d}>{d}s</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mb-1 block">
                        Seed Image Prompt (text-to-image)
                      </label>
                      <textarea
                        value={scene.seedPrompt}
                        onChange={(e) => updateScene(idx, { seedPrompt: e.target.value })}
                        rows={2}
                        className="w-full text-sm rounded-md border border-neutral-200 px-3 py-2 bg-neutral-50 resize-none focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
                      />
                    </div>
                    <button
                      onClick={() => setEditingIdx(null)}
                      className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
                    >
                      Done editing
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-neutral-600 leading-relaxed">
                      {scene.description || <span className="text-neutral-300 italic">No description</span>}
                    </p>
                    {scene.klingPrompt && (
                      <div className="rounded-lg bg-neutral-50 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-400 mb-0.5">Kling Prompt</p>
                        <p className="text-xs text-neutral-500 leading-relaxed">{scene.klingPrompt}</p>
                      </div>
                    )}
                    {scene.seedPrompt && (
                      <div className="rounded-lg bg-violet-50/50 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-violet-400 mb-0.5">Seed Prompt</p>
                        <p className="text-xs text-violet-600/70 leading-relaxed">{scene.seedPrompt}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Proceed button */}
          <Button
            onClick={handleProceed}
            disabled={proceeding || scenes.length === 0}
            className="w-full gap-2 bg-neutral-900 hover:bg-neutral-700 text-white h-11 text-sm"
          >
            {proceeding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting up production…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Proceed to Production ({scenes.length} scenes)
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
