"use client";

import { CheckCircle2, CircleX } from "lucide-react";
import type { ActionFeedbackState } from "@/hooks/useActionFeedback";
import { cn } from "@/lib/utils";

export default function ActionFeedback({ feedback, className }: {
  feedback: ActionFeedbackState | null;
  className?: string;
}) {
  if (!feedback) return null;
  const succeeded = feedback.type === "success";
  const Icon = succeeded ? CheckCircle2 : CircleX;
  return (
    <div role={succeeded ? "status" : "alert"} data-action-feedback={feedback.type} className={cn(
      "pointer-events-none absolute z-20 inline-flex max-w-[calc(100vw-3rem)] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md",
      succeeded
        ? "border-[var(--theme-color-semantic-success-border)] bg-[var(--theme-color-semantic-success-background)] text-[var(--theme-color-semantic-success-foreground)]"
        : "border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] text-[var(--theme-color-semantic-danger-foreground)]",
      className,
    )}>
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="w-max max-w-full [overflow-wrap:anywhere]">{feedback.message}</span>
    </div>
  );
}
