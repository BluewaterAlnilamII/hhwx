import { Filter } from "lucide-react";

export default function FilterResultCount({ label }: { label: string }) {
  return (
    <span className="hhwx-filter-count inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-panel-background)] px-2 text-xs font-semibold text-[var(--theme-color-action-secondary-foreground)] sm:h-10 sm:gap-2 sm:px-3 sm:text-sm">
      <Filter className="h-4 w-4" aria-hidden="true" />
      <span>
        {label.split(/(\d+)/u).map((part, index) => /^\d+$/u.test(part) ? (
          <span key={index} className="inline-block min-w-[4ch] text-right tabular-nums">{part}</span>
        ) : part)}
      </span>
    </span>
  );
}
