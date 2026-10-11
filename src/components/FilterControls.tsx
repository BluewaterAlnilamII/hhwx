"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import FilterResultCount from "@/components/FilterResultCount";
import { cn } from "@/lib/utils";

export function CatalogSearchToolbar({ query, placeholder, searchLabel, clearLabel, resultCountLabel, help, onQueryChange, onClear }: {
  query: string; placeholder: string; searchLabel: string; clearLabel: string; resultCountLabel: string;
  help: ReactNode; onQueryChange: (query: string) => void; onClear: () => void;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.value = query;
  }, [query]);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <form role="search" className="flex min-w-0 flex-1 gap-1.5 sm:gap-2" onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = searchInputRef.current?.value.trim() ?? "";
        if (next !== query) onQueryChange(next);
      }}>
        <div className="relative min-w-0 flex-1">
          <Search className="hhwx-filter-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-color-text-muted)]" aria-hidden="true" />
          <input ref={searchInputRef} type="search" defaultValue={query} enterKeyHint="search" aria-label={placeholder} placeholder={placeholder}
            className="hhwx-control h-9 w-full rounded-xl border pl-9 pr-3 text-sm transition sm:h-10"
            onInput={(event) => {
              if (event.currentTarget.value === "" && query !== "" && !(event.nativeEvent as InputEvent).isComposing) onQueryChange("");
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.stopPropagation();
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.preventDefault();
            }} />
        </div>
        <button type="submit" aria-label={searchLabel} className="hhwx-control inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition sm:h-10 sm:w-10">
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
        {help}
      </form>
      <div className="flex items-center gap-1.5 sm:gap-2" aria-live="polite">
        <FilterResultCount label={resultCountLabel} />
        <button type="button" onClick={() => {
          if (searchInputRef.current) searchInputRef.current.value = "";
          onClear();
        }} className="hhwx-control inline-flex h-8 items-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition sm:h-10 sm:gap-2 sm:px-3 sm:text-sm">
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
  disabled,
  children,
  onClick,
  className = "",
}: {
  isSelected: boolean;
  title: string;
  ariaLabel?: string;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={onClick}
      className={cn("hhwx-control inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-1.5 text-sm font-semibold transition sm:h-9 sm:min-w-9 sm:px-2", className)}
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
      className="min-w-11 px-2 text-xs sm:min-w-13 sm:px-3"
    >
      {allLabel}
    </SelectionButton>
  );
}

export function FilterRow({ label, children, inlineOnMobile = false }: { label: string; children: ReactNode; inlineOnMobile?: boolean }) {
  return (
    <div className={`grid gap-1.5 sm:grid-cols-[5.5rem_1fr] sm:items-start sm:gap-2${inlineOnMobile ? " grid-cols-[max-content_minmax(0,1fr)] items-center max-sm:gap-x-3" : ""}`}>
      <div className="hhwx-filter-label text-[13px] leading-5 font-medium text-[var(--theme-color-text-muted)] sm:pt-2 sm:text-sm">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">{children}</div>
    </div>
  );
}
