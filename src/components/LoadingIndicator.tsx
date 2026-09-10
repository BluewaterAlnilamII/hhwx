import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent text-[var(--theme-color-action-primary-background)] motion-safe:animate-spin", className)}
    />
  );
}

export default function LoadingIndicator({
  label,
  compact = false,
  className,
}: {
  label: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-busy="true"
      className={cn(
        "flex items-center justify-center text-center text-sm font-semibold text-[var(--theme-color-text-muted)]",
        compact ? "flex-row gap-2" : "flex-col gap-4",
        className,
      )}
    >
      <LoadingSpinner className={compact ? undefined : "h-10 w-10 border-4"} />
      <span>{label}</span>
    </span>
  );
}
