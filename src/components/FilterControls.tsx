"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import FilterResultCount from "@/components/FilterResultCount";

export function CatalogSearchToolbar({ query, placeholder, searchLabel, clearLabel, resultCountLabel, help, onQueryChange, onClear }: {
  query: string; placeholder: string; searchLabel: string; clearLabel: string; resultCountLabel: string;
  help: ReactNode; onQueryChange: (query: string) => void; onClear: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.value = query;
  }, [query]);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form role="search" className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = searchInputRef.current?.value.trim() ?? "";
        if (next !== query) onQueryChange(next);
      }}>
        <div className="relative min-w-0 flex-1">
          <Search className="hhwx-filter-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-color-text-muted)]" aria-hidden="true" />
          <input ref={searchInputRef} type="search" defaultValue={query} enterKeyHint="search" aria-label={placeholder} placeholder={placeholder}
            className="hhwx-control h-10 w-full rounded-xl border pl-9 pr-3 text-sm transition"
            onInput={(event) => {
              if (event.currentTarget.value === "" && query !== "" && !(event.nativeEvent as InputEvent).isComposing) onQueryChange("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.stopPropagation();
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.preventDefault();
            }} />
        </div>
        <button type="submit" aria-label={searchLabel} className="hhwx-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition">
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
        {help}
      </form>
      <div className="flex items-center gap-2" aria-live="polite">
        <FilterResultCount label={resultCountLabel} />
        <button type="button" onClick={() => {
          if (searchInputRef.current) searchInputRef.current.value = "";
          onClear();
        }} className="hhwx-control inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition">
          <X className="h-4 w-4" aria-hidden="true" />{clearLabel}
        </button>
      </div>
    </div>
  );
}

export function SelectionButton({
  isSelected,
  title,
  ariaLabel,
  children,
  onClick,
  className = "",
}: {
  isSelected: boolean;
  title: string;
  ariaLabel?: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onClick={onClick}
      className={`hhwx-control inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-semibold transition ${className}`}
    >
      {children}
    </button>
  );
}

export function ToggleAllButton({
  isSelected,
  allLabel,
  selectAllLabel,
  clearAllLabel,
  onClick,
}: {
  isSelected: boolean;
  allLabel: string;
  selectAllLabel: string;
  clearAllLabel: string;
  onClick: () => void;
}) {
  return (
    <SelectionButton
      isSelected={isSelected}
      title={isSelected ? clearAllLabel : selectAllLabel}
      ariaLabel={isSelected ? clearAllLabel : selectAllLabel}
      onClick={onClick}
      className="min-w-13 px-3 text-xs"
    >
      {allLabel}
    </SelectionButton>
  );
}

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <div className="hhwx-filter-label pt-2 text-sm font-medium text-[var(--theme-color-text-muted)]">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
