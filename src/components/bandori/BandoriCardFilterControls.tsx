"use client";

import { type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildBandoriResIconPublicUrl } from "@/lib/bandori-asset-proxy";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  type BandoriCardAttribute,
  type BandoriCardFilterState,
} from "@/lib/bandori-card-filter";

export type BandoriCardFilterControlsProps<TSortBy extends string> = {
  filter: BandoriCardFilterState<TSortBy>;
  resultCountLabel: string;
  bandOptions: Array<{ bandId: number; label: string }>;
  characterOptions: Array<{ characterId: number; label: string }>;
  availableBandIds: number[];
  availableCharacterIds: number[];
  sortOptions: Array<{ value: TSortBy; label: string }>;
  onFilterChange: (patch: Partial<BandoriCardFilterState<TSortBy>>) => void;
  onClearFilter: () => void;
};

const ATTRIBUTE_SWATCH_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "bg-rose-500",
  cool: "bg-sky-500",
  happy: "bg-amber-400",
  pure: "bg-emerald-500",
};

function toggleSelection<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function areAllSelected<T>(selectedValues: readonly T[], availableValues: readonly T[]): boolean {
  return availableValues.length > 0 && availableValues.every((value) => selectedValues.includes(value));
}

function SelectionButton({
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

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <div className="pt-2 text-sm font-medium text-slate-600">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function iconUrl(name: string): string {
  return buildBandoriResIconPublicUrl(name);
}

export default function BandoriCardFilterControls<TSortBy extends string>({
  filter,
  resultCountLabel,
  bandOptions,
  characterOptions,
  availableBandIds,
  availableCharacterIds,
  sortOptions,
  onFilterChange,
  onClearFilter,
}: BandoriCardFilterControlsProps<TSortBy>) {
  const t = useTranslations("bandori.cardFilters");
  const allLabel = t("actions.all");
  const bandLabel = t("rows.band");
  const attributeLabel = t("rows.attribute");
  const rarityLabel = t("rows.rarity");
  const characterLabel = t("rows.character");

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
          {bandOptions.map((option) => (
            <SelectionButton
              key={option.bandId}
              title={option.label}
              isSelected={filter.bandIds.includes(option.bandId)}
              onClick={() => onFilterChange({ bandIds: toggleSelection(filter.bandIds, option.bandId) })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl(`band_${option.bandId}.svg`)} alt={option.label} loading="lazy" decoding="async" className="h-7 w-7 object-contain" />
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.bandIds, availableBandIds)}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: bandLabel })}
            clearAllLabel={t("actions.clearAllGroup", { group: bandLabel })}
            onClick={() => onFilterChange({
              bandIds: areAllSelected(filter.bandIds, availableBandIds) ? [] : availableBandIds,
            })}
          />
        </FilterRow>

        <FilterRow label={attributeLabel}>
          {BANDORI_CARD_ATTRIBUTES.map((attribute) => (
            <SelectionButton
              key={attribute}
              title={t(`attributes.${attribute}`)}
              isSelected={filter.attributes.includes(attribute)}
              onClick={() => onFilterChange({ attributes: toggleSelection(filter.attributes, attribute) })}
            >
              <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${ATTRIBUTE_SWATCH_CLASSES[attribute]}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconUrl(`${attribute}.svg`)} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
              </span>
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.attributes, BANDORI_CARD_ATTRIBUTES)}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: attributeLabel })}
            clearAllLabel={t("actions.clearAllGroup", { group: attributeLabel })}
            onClick={() => onFilterChange({
              attributes: areAllSelected(filter.attributes, BANDORI_CARD_ATTRIBUTES)
                ? []
                : [...BANDORI_CARD_ATTRIBUTES],
            })}
          />
        </FilterRow>

        <FilterRow label={rarityLabel}>
          {BANDORI_CARD_RARITIES.map((rarity) => (
            <SelectionButton
              key={rarity}
              title={t("rarityAlt", { rarity })}
              isSelected={filter.rarities.includes(rarity)}
              onClick={() => onFilterChange({ rarities: toggleSelection(filter.rarities, rarity) })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl(`star_${rarity}.png`)} alt={t("rarityAlt", { rarity })} loading="lazy" decoding="async" className="h-5 w-5 object-contain" />
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.rarities, BANDORI_CARD_RARITIES)}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: rarityLabel })}
            clearAllLabel={t("actions.clearAllGroup", { group: rarityLabel })}
            onClick={() => onFilterChange({
              rarities: areAllSelected(filter.rarities, BANDORI_CARD_RARITIES)
                ? []
                : [...BANDORI_CARD_RARITIES],
            })}
          />
        </FilterRow>

        <FilterRow label={characterLabel}>
          {characterOptions.map((option) => (
            <SelectionButton
              key={option.characterId}
              title={option.label}
              isSelected={filter.characterIds.includes(option.characterId)}
              onClick={() => onFilterChange({ characterIds: toggleSelection(filter.characterIds, option.characterId) })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={iconUrl(`chara_icon_${option.characterId}.png`)} alt={option.label} loading="lazy" decoding="async" className="h-6 w-6 rounded-full object-cover" />
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(filter.characterIds, availableCharacterIds)}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: characterLabel })}
            clearAllLabel={t("actions.clearAllGroup", { group: characterLabel })}
            onClick={() => onFilterChange({
              characterIds: areAllSelected(filter.characterIds, availableCharacterIds) ? [] : availableCharacterIds,
            })}
          />
        </FilterRow>

        <FilterRow label={t("rows.sort")}>
          <select
            value={filter.sortBy}
            onChange={(event) => onFilterChange({ sortBy: event.target.value as TSortBy })}
            aria-label={t("rows.sort")}
            className="h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onFilterChange({ sortDirection: filter.sortDirection === "desc" ? "asc" : "desc" })}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
            title={filter.sortDirection === "desc" ? t("sortDirection.descTitle") : t("sortDirection.ascTitle")}
            aria-label={filter.sortDirection === "desc" ? t("sortDirection.descAria") : t("sortDirection.ascAria")}
          >
            {filter.sortDirection === "desc"
              ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />
              : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}
            {filter.sortDirection === "desc" ? t("sortDirection.desc") : t("sortDirection.asc")}
          </button>
        </FilterRow>
      </div>
    </div>
  );
}
