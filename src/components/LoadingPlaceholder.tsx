import { cn } from "@/lib/utils";

export default function LoadingPlaceholder({ label, className }: { label: string; className?: string }) {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn("block rounded-lg bg-[var(--theme-color-control-background-muted)] motion-safe:animate-pulse", className)}
    />
  );
}
