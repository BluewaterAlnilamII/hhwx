"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";
import { CatalogSearchToolbar, FilterRow } from "@/components/FilterControls";

type SongFilterState<S extends string> = {
  query: string; minLevel: number | null; maxLevel: number | null; sortBy: S; sortDirection: "asc" | "desc";
};

function LevelInput({ label, value, onCommit, inputRef }: {
  label: string; value: number | null; onCommit: (value: number | null) => void; inputRef: RefObject<HTMLInputElement | null>;
}) {
  useEffect(() => { if (inputRef.current) inputRef.current.value = value === null ? "" : String(value); }, [value, inputRef]);
  const commit = () => {
    const raw = inputRef.current?.value ?? "";
    const number = Number(raw);
    const next = Number.isSafeInteger(number) && number > 0 ? number : null;
    if (next !== value) onCommit(next);
  };
  return <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-color-text-muted)] sm:gap-2">
    {label}<input ref={inputRef} type="number" min={1} inputMode="numeric" defaultValue={value ?? ""} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
      className="hhwx-control h-9 w-14 rounded-xl border px-2 text-sm transition sm:h-10 sm:w-20 sm:px-3" />
  </label>;
}

export default function SongFilterControls<S extends string>({ filter, resultCountLabel, labels, sortOptions, help, children, onFilterChange, onClearFilter }: {
  filter: SongFilterState<S>; resultCountLabel: string; help: ReactNode; children: ReactNode;
  labels: { searchPlaceholder: string; search: string; clear: string; level: string; min: string; max: string; sort: string;
    asc: string; desc: string; directionTitle: string; directionAria: string };
  sortOptions: { value: S; label: string }[];
  onFilterChange: (patch: Partial<SongFilterState<S>>) => void; onClearFilter: () => void;
}) {
  const minLevelInputRef = useRef<HTMLInputElement>(null);
  const maxLevelInputRef = useRef<HTMLInputElement>(null);
  return <div className="hhwx-panel border p-3 sm:p-4">
    <CatalogSearchToolbar query={filter.query} placeholder={labels.searchPlaceholder} searchLabel={labels.search} clearLabel={labels.clear}
      resultCountLabel={resultCountLabel} help={help} onQueryChange={(query) => onFilterChange({ query })} onClear={() => {
        for (const ref of [minLevelInputRef, maxLevelInputRef]) if (ref.current) ref.current.value = "";
        onClearFilter();
      }} />
    <div className="mt-3 space-y-3 sm:mt-4">
      {children}
      <FilterRow label={labels.level} inlineOnMobile>
        <LevelInput inputRef={minLevelInputRef} label={labels.min} value={filter.minLevel} onCommit={(minLevel) => onFilterChange({ minLevel })} />
        <span className="text-[var(--theme-color-text-muted)]" aria-hidden="true">–</span>
        <LevelInput inputRef={maxLevelInputRef} label={labels.max} value={filter.maxLevel} onCommit={(maxLevel) => onFilterChange({ maxLevel })} />
      </FilterRow>
      {sortOptions.length > 0 ? <FilterRow label={labels.sort} inlineOnMobile>
        <select value={filter.sortBy} aria-label={labels.sort} onChange={(event) => onFilterChange({ sortBy: event.target.value as S })}
          className="hhwx-control h-9 min-w-0 flex-1 rounded-xl border px-3 text-sm transition sm:h-10 sm:min-w-64 sm:flex-none">
          {sortOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={() => onFilterChange({ sortDirection: filter.sortDirection === "desc" ? "asc" : "desc" })}
          className="hhwx-control inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition sm:h-10 sm:gap-2 sm:px-3" title={labels.directionTitle} aria-label={labels.directionAria}>
          {filter.sortDirection === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" /> : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}
          {labels[filter.sortDirection]}
        </button>
      </FilterRow> : null}
    </div>
  </div>;
}
