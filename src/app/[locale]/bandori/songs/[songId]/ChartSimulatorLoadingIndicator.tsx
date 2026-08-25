import { Loader2 } from "lucide-react";

type ChartSimulatorLoadingIndicatorProps = {
  completedResources?: number | null;
  label: string;
  totalResources?: number | null;
};

export default function ChartSimulatorLoadingIndicator({
  completedResources = null,
  label,
  totalResources = null,
}: ChartSimulatorLoadingIndicatorProps) {
  const progressPercentage = completedResources !== null
    && totalResources !== null
    && totalResources > 0
    ? Math.floor(
        (Math.min(Math.max(completedResources, 0), totalResources) / totalResources) * 100,
      )
    : null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center text-[var(--theme-color-text-muted)]">
      <Loader2
        className="h-7 w-7 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p aria-live="polite" className="text-sm font-semibold">
        {label}
      </p>
      {progressPercentage !== null ? (
        <span
          aria-hidden="true"
          className="text-sm font-black tabular-nums text-[var(--theme-color-text-default)]"
        >
          {progressPercentage}%
        </span>
      ) : null}
    </div>
  );
}
