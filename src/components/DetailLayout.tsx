import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Heading from "@/components/Heading";

export function DetailHeader({ backHref, backLabel, title, id, reference, serverSwitcher }: {
  backHref: string; backLabel: string; title: ReactNode; id: string | number;
  reference?: ReactNode; serverSwitcher: ReactNode;
}) {
  return <>
    <Link href={backHref} className="hhwx-text-link inline-flex items-center gap-2 text-sm font-black transition">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />{backLabel}
    </Link>
    <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Heading as="h1" visualRole="page" className="wrap-break-word tracking-tight">{title}</Heading>
        <div className="mt-2 flex min-h-5 flex-wrap items-baseline gap-x-3 gap-y-1 text-sm leading-5 text-[var(--theme-color-text-muted)]">
          <span className="font-black uppercase tracking-[0.18em]">#{id}</span>
          {reference ? <span lang="ja" className="font-semibold">{reference}</span> : null}
        </div>
      </div>
      {serverSwitcher}
    </div>
  </>;
}

export function DetailStats({ items }: { items: { label: string; value: ReactNode }[] }) {
  const threeColumns = items.length === 3;
  return <div className="mt-6 border-t border-[var(--theme-color-border-subtle)] pt-5">
    <div className={threeColumns ? "grid grid-cols-3" : "grid grid-cols-2 sm:grid-cols-4"}>
      {items.map(({ label, value }, index) => <div key={label}
        className={cn("border-[var(--theme-color-border-subtle)] px-3 py-3 text-center", threeColumns
          ? index > 0 && "border-l"
          : `${index % 2 === 1 ? "border-l" : ""} ${index >= 2 ? "border-t sm:border-t-0" : ""} ${index > 0 ? "sm:border-l" : "sm:border-l-0"}`)}>
        <div className="text-xs font-bold text-[var(--theme-color-text-muted)]">{label}</div>
        <div className="mt-1 text-xl font-black tabular-nums text-[var(--theme-color-text-default)]">{value}</div>
      </div>)}
    </div>
  </div>;
}

export function DetailRow({
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

export function DetailColumns({ left, right, stackedDivider = true }: { left: ReactNode; right: ReactNode; stackedDivider?: boolean }) {
  return (
    <div className="grid min-w-0 items-stretch gap-y-0 @min-[54rem]:grid-cols-2 @min-[54rem]:gap-x-0">
      <div className="min-w-0 @min-[54rem]:pr-8">{left}</div>
      <div className={cn("min-w-0 border-[var(--theme-color-border-subtle)] @min-[54rem]:border-l @min-[54rem]:border-t-0 @min-[54rem]:pl-8", stackedDivider && "border-t")}>{right}</div>
    </div>
  );
}

export function RegionalDetailRow({ label, currentValue, jpValue }: { label: string; currentValue: ReactNode; jpValue?: ReactNode }) {
  return <DetailRow label={label}>
    <span className="block">{currentValue}</span>
    {jpValue ? <span className="mt-1 block font-medium text-[var(--theme-color-text-muted)] opacity-70">{jpValue}</span> : null}
  </DetailRow>;
}
