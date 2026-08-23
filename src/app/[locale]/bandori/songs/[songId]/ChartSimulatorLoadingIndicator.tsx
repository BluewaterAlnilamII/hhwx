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
  const hasResourceCount = completedResources !== null
    && totalResources !== null
    && totalResources > 0;

  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center text-[var(--theme-color-text-muted)]">
      <Loader2
        className="h-7 w-7 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p aria-live="polite" className="text-sm font-semibold">
        {label}
      </p>
      {hasResourceCount ? (
        <span
          aria-hidden="true"
          className="text-sm font-black tabular-nums text-[var(--theme-color-text-default)]"
        >
          {completedResources} / {totalResources}
        </span>
      ) : null}
    </div>
  );
}
