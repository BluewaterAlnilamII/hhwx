"use client";

import { type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border bg-white px-2 text-sm font-semibold text-slate-700 shadow-xs transition ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-400/70"
          : "border-slate-200 hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
      } ${className}`}
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
      <div className="pt-2 text-sm font-medium text-slate-600">{label}</div>
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

export default function BandoriSongFilterControls({
  filter,
  resultCountLabel,
  onFilterChange,
  onClearFilter,
}: BandoriSongFilterControlsProps) {
  const t = useTranslations("bandori.songs.filters");
  const bandLabel = t("rows.band");
  const typeLabel = t("rows.type");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={filter.query}
            onChange={(event) => onFilterChange({ query: event.target.value })}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
            <Filter className="h-4 w-4" aria-hidden="true" />
            {resultCountLabel}
          </span>
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t("actions.clear")}
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
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
              title={difficulty === "all" ? t("allDifficulties") : t(`difficulties.${difficulty}`)}
              isSelected={filter.difficulty === difficulty}
              onClick={() => onFilterChange({ difficulty })}
              className="px-3 text-xs"
            >
              {difficulty === "all" ? t("actions.all") : t(`difficulties.${difficulty}`)}
            </SelectionButton>
          ))}
        </FilterRow>

        <FilterRow label={t("rows.level")}>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            {t("levelMin")}
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={numberInputValue(filter.minLevel)}
              onChange={(event) => onFilterChange({ minLevel: parseLevelInput(event.target.value) })}
              className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <span className="text-slate-400" aria-hidden="true">–</span>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            {t("levelMax")}
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={numberInputValue(filter.maxLevel)}
              onChange={(event) => onFilterChange({ maxLevel: parseLevelInput(event.target.value) })}
              className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </label>
        </FilterRow>

        <FilterRow label={t("rows.sort")}>
          <select
            value={filter.sortBy}
            onChange={(event) => onFilterChange({
              sortBy: event.target.value as BandoriSongsPageFilter["sortBy"],
            })}
            aria-label={t("rows.sort")}
            className="h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
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
