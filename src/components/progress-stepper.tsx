"use client";

import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";

type Step = {
  id: string;
  label: string;
  status: "completed" | "current" | "upcoming" | "locked";
};

export type { Step };

export function ProgressStepper({
  steps,
  onStepClick,
}: {
  steps: Step[];
  onStepClick?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center">
          {i > 0 && (
            <div
              className={cn(
                "w-8 h-px mx-1",
                steps[i - 1].status === "completed"
                  ? "bg-[#6366f1]"
                  : "bg-[#27272a] border-t border-dashed border-[#3f3f46]"
              )}
            />
          )}
          <button
            onClick={() =>
              (step.status === "completed" || step.status === "current") &&
              onStepClick?.(step.id)
            }
            disabled={step.status === "locked" || step.status === "upcoming"}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              step.status === "completed" &&
                "bg-[#6366f1]/10 text-[#6366f1] hover:bg-[#6366f1]/20 cursor-pointer",
              step.status === "current" &&
                "bg-[#6366f1] text-white ring-2 ring-[#6366f1]/30",
              step.status === "upcoming" &&
                "bg-[#18181b] text-[#71717a] border border-[#27272a] cursor-default",
              step.status === "locked" &&
                "bg-[#18181b] text-[#52525b] border border-[#27272a] cursor-not-allowed opacity-60"
            )}
          >
            {step.status === "completed" ? (
              <Check className="h-3 w-3" />
            ) : step.status === "locked" ? (
              <Lock className="h-3 w-3" />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  step.status === "current"
                    ? "bg-white animate-pulse"
                    : "bg-[#3f3f46]"
                )}
              />
            )}
            {step.label}
          </button>
        </div>
      ))}
    </div>
  );
}
