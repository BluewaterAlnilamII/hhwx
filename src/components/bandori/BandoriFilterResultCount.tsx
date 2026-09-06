import { Filter } from "lucide-react";

export default function BandoriFilterResultCount({ label }: { label: string }) {
  return (
    <span className="hhwx-filter-count inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
      <Filter className="h-4 w-4" aria-hidden="true" />
      <span>
        {label.split(/(\d+)/u).map((part, index) => /^\d+$/u.test(part) ? (
          <span key={index} className="inline-block min-w-[4ch] text-right tabular-nums">{part}</span>
        ) : part)}
      </span>
    </span>
  );
}
