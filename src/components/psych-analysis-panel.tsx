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

  return (
    <div className="space-y-6">
      {/* Analysis sections */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900">
          Psychological Analysis
        </h3>
        <div className="grid gap-3">
          {ANALYSIS_SECTIONS.map(({ key, label, icon }) => (
            <div
              key={key}
              className="rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-neutral-400">{icon}</span>
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  {label}
                </span>
              </div>
              <p className="text-sm text-neutral-700 leading-relaxed">
                {analysis[key]}
              </p>
            </div>
          ))}

          {/* Emotional triggers as tags */}
          {analysis.emotionalTriggers.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-neutral-400" />
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                  Emotional Triggers
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.emotionalTriggers.map((trigger) => (
                  <span
                    key={trigger}
                    className="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100"
                  >
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editable copy fields */}
      <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900">
          Ad Copy
        </h3>
        <p className="text-xs text-neutral-400 -mt-2">
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
              className="bg-neutral-50"
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
                "flex w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2",
                "text-sm ring-offset-background placeholder:text-neutral-400",
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
              className="bg-neutral-50"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => onConfirm({ headline, body, cta })}
            disabled={isGenerating || !headline.trim()}
            className="bg-neutral-900 hover:bg-neutral-700 text-white"
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
    </div>
  );
}
