import { Filter } from "lucide-react";

export default function BandoriFilterResultCount({ label }: { label: string }) {
  return (
    <span className="hhwx-filter-count inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-panel-background)] px-3 text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)]">
      <Filter className="h-4 w-4" aria-hidden="true" />
      <span>
        {label.split(/(\d+)/u).map((part, index) => /^\d+$/u.test(part) ? (
          <span key={index} className="inline-block min-w-[4ch] text-right tabular-nums">{part}</span>
        ) : part)}
      </span>
    </span>
  );
}
