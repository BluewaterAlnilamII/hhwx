"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import BandoriSearchHelp from "@/components/bandori/BandoriSearchHelp";
import BandoriFilterResultCount from "@/components/bandori/BandoriFilterResultCount";
import { buildBandoriCardBandIconUrl } from "@/lib/bandori-builtin-resources";
import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_DIFFICULTY_FILTERS,
  BANDORI_SONG_SORTS,
  BANDORI_SONG_TYPES,
  type BandoriSongBandFilter,
  type BandoriSongType,
  type BandoriSongsPageFilter,
} from "@/lib/bandori/songs/catalog";
import { BANDORI_SERVERS, getBandoriServerCode } from "@/lib/bandori-server";

type BandoriSongFilterControlsProps = {
  filter: BandoriSongsPageFilter;
  resultCountLabel: string;
  onFilterChange: (patch: Partial<BandoriSongsPageFilter>) => void;
  onClearFilter: () => void;
};

function toggleSelection<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function areAllSelected<T>(selected: readonly T[], available: readonly T[]): boolean {
  return available.length > 0 && available.every((value) => selected.includes(value));
}

function SelectionButton({
  isSelected,
  title,
  children,
  onClick,
  className = "",
}: {
  isSelected: boolean;
  title: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={isSelected}
      onClick={onClick}
      className={`hhwx-control inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-semibold transition ${className}`}
    >
      {children}
    </button>
  );
}

function ToggleAllButton({
  isSelected,
  label,
  onClick,
}: {
  isSelected: boolean;
  label: string;
  onClick: () => void;
}) {
  const t = useTranslations("bandori.songs.filters");
  return (
    <SelectionButton
      isSelected={isSelected}
      title={isSelected ? t("actions.clearAll", { group: label }) : t("actions.selectAll", { group: label })}
      onClick={onClick}
      className="min-w-13 px-3 text-xs"
    >
      {t("actions.all")}
    </SelectionButton>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <div className="hhwx-filter-label pt-2 text-sm font-medium text-[var(--theme-color-text-muted)]">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function numberInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseLevelInput(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function LevelInput({ label, value, onCommit, inputRef }: { label: string; value: number | null; onCommit: (value: number | null) => void; inputRef: RefObject<HTMLInputElement | null> }) {
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = numberInputValue(value);
  }, [value, inputRef]);
  const commit = () => {
    const next = parseLevelInput(inputRef.current?.value ?? "");
    if (next !== value) onCommit(next);
  };
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--theme-color-text-muted)]">
      {label}
      <input
        ref={inputRef}
        type="number"
        min={1}
        inputMode="numeric"
        defaultValue={numberInputValue(value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="hhwx-control h-10 w-20 rounded-xl border px-3 text-sm transition"
      />
    </label>
  );
}

export default function BandoriSongFilterControls({
  filter,
  resultCountLabel,
  onFilterChange,
  onClearFilter,
}: BandoriSongFilterControlsProps) {
  const t = useTranslations("bandori.songs.filters");
  const searchT = useTranslations("bandori.cardFilters.actions");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const minLevelInputRef = useRef<HTMLInputElement>(null);
  const maxLevelInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.value = filter.query;
  }, [filter.query]);
  const bandLabel = t("rows.band");
  const typeLabel = t("rows.type");
  const serverLabel = t("rows.serverAvailability");

  return (
    <div className="hhwx-panel border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const query = searchInputRef.current?.value.trim() ?? "";
            if (query !== filter.query) onFilterChange({ query });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="hhwx-filter-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--theme-color-text-muted)]" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              defaultValue={filter.query}
              onInput={(event) => {
                if (event.currentTarget.value === "" && filter.query !== "" && !(event.nativeEvent as InputEvent).isComposing) {
                  onFilterChange({ query: "" });
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.stopPropagation();
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) event.preventDefault();
              }}
              enterKeyHint="search"
              aria-label={t("searchPlaceholder")}
              placeholder={t("searchPlaceholder")}
              className="hhwx-control h-10 w-full rounded-xl border pl-9 pr-3 text-sm transition"
            />
          </div>
          <button
            type="submit"
            aria-label={searchT("search")}
            className="hhwx-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          <BandoriSearchHelp kind="songs" />
        </form>
        <div className="flex items-center gap-2">
          <BandoriFilterResultCount label={resultCountLabel} />
          <button
            type="button"
            onClick={() => {
              for (const inputRef of [searchInputRef, minLevelInputRef, maxLevelInputRef]) {
                if (inputRef.current) inputRef.current.value = "";
              }
              onClearFilter();
            }}
            className="hhwx-control inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("actions.clear")}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <FilterRow label={serverLabel}>
          {BANDORI_SERVERS.map((server) => {
            const code = getBandoriServerCode(server).toUpperCase();
            return (
              <SelectionButton
                key={server}
                title={t("serverAvailabilityAria", { server: code })}
                isSelected={filter.servers.includes(server)}
                onClick={() => onFilterChange({
                  servers: toggleSelection(filter.servers, server),
                })}
                className="gap-1.5 px-2.5"
              >
                <BandoriServerIcon server={server} size={22} isDecorative />
                <span className="text-xs font-black">{code}</span>
              </SelectionButton>
            );
          })}
          <ToggleAllButton
            isSelected={areAllSelected(filter.servers, BANDORI_SERVERS)}
            label={serverLabel}
            onClick={() => onFilterChange({
              servers: areAllSelected(filter.servers, BANDORI_SERVERS)
                ? []
                : [...BANDORI_SERVERS],
            })}
          />
        </FilterRow>

        <FilterRow label={bandLabel}>
          {BANDORI_CHARACTER_GROUPS.map((group) => (
            <SelectionButton
              key={group.bandId}
              title={group.label}
              isSelected={filter.bands.includes(group.bandId)}
              onClick={() => onFilterChange({
                bands: toggleSelection<BandoriSongBandFilter>(filter.bands, group.bandId),
              })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildBandoriCardBandIconUrl(group.bandId) ?? undefined}
                alt={group.label}
                loading="lazy"
                decoding="async"
                className="h-7 w-7 object-contain"
              />
            </SelectionButton>
          ))}
          <SelectionButton
            title={t("otherBand")}
            isSelected={filter.bands.includes("other")}
            onClick={() => onFilterChange({
              bands: toggleSelection<BandoriSongBandFilter>(filter.bands, "other"),
            })}
            className="px-3 text-xs"
          >
            {t("otherBand")}
          </SelectionButton>
          <ToggleAllButton
            isSelected={areAllSelected(filter.bands, BANDORI_SONG_BAND_FILTERS)}
            label={bandLabel}
            onClick={() => onFilterChange({
              bands: areAllSelected(filter.bands, BANDORI_SONG_BAND_FILTERS)
                ? []
                : [...BANDORI_SONG_BAND_FILTERS],
            })}
          />
        </FilterRow>

        <FilterRow label={typeLabel}>
          {BANDORI_SONG_TYPES.map((type) => (
            <SelectionButton
              key={type}
              title={t(`types.${type}`)}
              isSelected={filter.types.includes(type)}
              onClick={() => onFilterChange({
                types: toggleSelection<BandoriSongType>(filter.types, type),
              })}
              className="px-3 text-xs"
            >
              {t(`types.${type}`)}
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.types, BANDORI_SONG_TYPES)}
            label={typeLabel}
            onClick={() => onFilterChange({
              types: areAllSelected(filter.types, BANDORI_SONG_TYPES)
                ? []
                : [...BANDORI_SONG_TYPES],
            })}
          />
        </FilterRow>

        <FilterRow label={t("rows.difficulty")}>
          {BANDORI_SONG_DIFFICULTY_FILTERS.map((difficulty) => (
            <SelectionButton
              key={difficulty}
              title={t(`difficulties.${difficulty}`)}
              isSelected={filter.difficulties.includes(difficulty)}
              onClick={() => onFilterChange({ difficulties: toggleSelection(filter.difficulties, difficulty) })}
              className="px-3 text-xs"
            >
              {t(`difficulties.${difficulty}`)}
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS)}
            label={t("rows.difficulty")}
            onClick={() => onFilterChange({
              difficulties: areAllSelected(filter.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS)
                ? []
                : [...BANDORI_SONG_DIFFICULTY_FILTERS],
            })}
          />
        </FilterRow>

        <FilterRow label={t("rows.level")}>
          <LevelInput inputRef={minLevelInputRef} label={t("levelMin")} value={filter.minLevel} onCommit={(minLevel) => onFilterChange({ minLevel })} />
          <span className="text-[var(--theme-color-text-muted)]" aria-hidden="true">–</span>
          <LevelInput inputRef={maxLevelInputRef} label={t("levelMax")} value={filter.maxLevel} onCommit={(maxLevel) => onFilterChange({ maxLevel })} />
        </FilterRow>

        <FilterRow label={t("rows.sort")}>
          <select
            value={filter.sortBy}
            onChange={(event) => onFilterChange({
              sortBy: event.target.value as BandoriSongsPageFilter["sortBy"],
            })}
            aria-label={t("rows.sort")}
            className="hhwx-control h-10 min-w-64 rounded-xl border px-3 text-sm transition"
          >
            {BANDORI_SONG_SORTS.map((sort) => (
              <option key={sort} value={sort}>{t(`sort.${sort}`)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onFilterChange({
              sortDirection: filter.sortDirection === "desc" ? "asc" : "desc",
            })}
            className="hhwx-control inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition"
            title={t(`sortDirection.${filter.sortDirection}Title`)}
            aria-label={t(`sortDirection.${filter.sortDirection}Aria`)}
          >
            {filter.sortDirection === "desc"
              ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />
              : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}
            {t(`sortDirection.${filter.sortDirection}`)}
          </button>
        </FilterRow>
      </div>
    </div>
  );
}
