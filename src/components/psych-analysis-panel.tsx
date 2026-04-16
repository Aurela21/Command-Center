"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Eye,
  Palette,
  PenLine,
  Heart,
  MousePointerClick,
  Focus,
  Lightbulb,
  Loader2,
  ChevronDown,
} from "lucide-react";
import type { StaticAdAnalysis } from "@/lib/claude";

type AdCopy = { headline: string; body: string; cta: string };

const ANALYSIS_SECTIONS: Array<{
  key: keyof Omit<StaticAdAnalysis, "extractedCopy" | "emotionalTriggers">;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: "visualHierarchy", label: "Visual Hierarchy", icon: <Eye className="h-4 w-4" /> },
  { key: "colorPsychology", label: "Color Psychology", icon: <Palette className="h-4 w-4" /> },
  { key: "copyFraming", label: "Copy Framing", icon: <PenLine className="h-4 w-4" /> },
  { key: "ctaAnalysis", label: "CTA Analysis", icon: <MousePointerClick className="h-4 w-4" /> },
  { key: "attentionMechanics", label: "Attention Mechanics", icon: <Focus className="h-4 w-4" /> },
  { key: "overallStrategy", label: "Overall Strategy", icon: <Lightbulb className="h-4 w-4" /> },
];

export function PsychAnalysisPanel({
  analysis,
  extractedCopy,
  onConfirm,
  onCancel,
  isGenerating,
}: {
  analysis: StaticAdAnalysis;
  extractedCopy: AdCopy;
  onConfirm: (finalCopy: AdCopy) => void;
  onCancel: () => void;
  isGenerating: boolean;
}) {
  const [headline, setHeadline] = useState(extractedCopy.headline);
  const [body, setBody] = useState(extractedCopy.body);
  const [cta, setCta] = useState(extractedCopy.cta);
  const [expanded, setExpanded] = useState(false);

  const summaryTriggers = analysis.emotionalTriggers.slice(0, 2).join(", ");
  const summaryFraming = analysis.copyFraming.length > 60
    ? analysis.copyFraming.slice(0, 60) + "..."
    : analysis.copyFraming;

  return (
    <div className="space-y-6">
      {/* Summary line */}
      <div className="rounded-lg border border-[#27272a] bg-[#18181b] px-4 py-3">
        <p className="text-sm text-[#a1a1aa] leading-relaxed">
          {summaryTriggers && (
            <>
              <span className="text-rose-400 font-medium">{summaryTriggers}</span>
              {" — "}
            </>
          )}
          {summaryFraming}
        </p>
      </div>

      {/* Editable copy fields */}
      <div className="space-y-4 rounded-xl border border-[#27272a] bg-[#18181b] p-5">
        <h3 className="text-sm font-semibold text-[#fafafa]">
          Ad Copy
        </h3>
        <p className="text-xs text-[#71717a] -mt-2">
          Edit the copy below, then confirm to generate the new ad.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ad-headline" className="text-xs">
              Headline
            </Label>
            <Input
              id="ad-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="bg-[#09090b]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-body" className="text-xs">
              Body Copy
            </Label>
            <textarea
              id="ad-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-[#27272a] bg-[#09090b] px-3 py-2",
                "text-sm ring-offset-background placeholder:text-[#71717a]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "resize-none"
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ad-cta" className="text-xs">
              CTA Text
            </Label>
            <Input
              id="ad-cta"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="bg-[#09090b]"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => onConfirm({ headline, body, cta })}
            disabled={isGenerating || !headline.trim()}
            className="bg-[#6366f1] hover:bg-[#6366f1]/80 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              "Confirm & Generate"
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isGenerating}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Toggle for full analysis */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-[#71717a] hover:text-[#a1a1aa] transition-colors"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            !expanded && "-rotate-90"
          )}
        />
        {expanded ? "Hide analysis" : "Show full analysis"}
      </button>

      {/* Full analysis sections (collapsed by default) */}
      {expanded && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#fafafa]">
            Psychological Analysis
          </h3>
          <div className="grid gap-3">
            {ANALYSIS_SECTIONS.map(({ key, label, icon }) => (
              <div
                key={key}
                className="rounded-lg border border-[#27272a] bg-[#18181b] p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[#71717a]">{icon}</span>
                  <span className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
                    {label}
                  </span>
                </div>
                <p className="text-sm text-[#a1a1aa] leading-relaxed">
                  {analysis[key]}
                </p>
              </div>
            ))}

            {/* Emotional triggers as tags */}
            {analysis.emotionalTriggers.length > 0 && (
              <div className="rounded-lg border border-[#27272a] bg-[#18181b] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="h-4 w-4 text-[#71717a]" />
                  <span className="text-xs font-medium text-[#a1a1aa] uppercase tracking-wide">
                    Emotional Triggers
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.emotionalTriggers.map((trigger) => (
                    <span
                      key={trigger}
                      className="text-xs px-2 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    >
                      {trigger}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
