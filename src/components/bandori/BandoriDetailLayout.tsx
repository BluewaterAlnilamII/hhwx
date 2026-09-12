import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BandoriDetailRow({
  label,
  children,
  mobileLayout = "inline",
  alignment = "baseline",
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  mobileLayout?: "inline" | "stacked";
  alignment?: "baseline" | "center" | "start";
  className?: string;
}) {
  return (
    <div className={cn(
      "grid border-b border-[var(--theme-color-border-subtle)] py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-5",
      alignment === "center" ? "items-center" : alignment === "start" ? "items-start" : "items-baseline",
      mobileLayout === "inline" ? "grid-cols-[7rem_minmax(0,1fr)] gap-3" : "grid-cols-1 gap-1",
      className,
    )}>
      <dt className="text-sm font-semibold leading-5 text-[var(--theme-color-text-muted)]">{label}</dt>
      <dd className="flex min-w-0 flex-col items-end wrap-break-word text-right text-sm font-semibold leading-5 text-[var(--theme-color-text-default)]">{children}</dd>
    </div>
  );
}

export function BandoriDetailColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
      <div className="min-w-0 @min-[54rem]:pr-8">{left}</div>
      <div className="min-w-0 border-t border-[var(--theme-color-border-subtle)] @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8">{right}</div>
    </div>
  );
}
