"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildBandoriCardAttributeIconUrl,
  buildBandoriCardBandIconUrl,
  buildBandoriCharacterIconUrl,
  buildBandoriLegacyRarityCompositeUrl,
} from "@/lib/bandori-builtin-resources";
import BandoriServerIcon from "@/components/bandori/BandoriServerIcon";
import BandoriSearchHelp from "./BandoriSearchHelp";
import BandoriFilterResultCount from "./BandoriFilterResultCount";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_CATALOG_TYPES,
  BANDORI_CARD_RARITIES,
  type BandoriCardAttribute,
  type BandoriCardFilterState,
} from "@/lib/bandori/cards/filter";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

export type BandoriCardFilterControlsProps<TSortBy extends string> = {
  className?: string;
  filter: BandoriCardFilterState<TSortBy>;
  resultCountLabel: string;
  bandOptions: Array<{ bandId: number; label: string }>;
  characterOptions: Array<{ characterId: number; label: string }>;
  availableBandIds: number[];
  availableCharacterIds: number[];
  availableServers: BandoriServer[];
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
      className={`hhwx-control inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-semibold transition ${className}`}
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
      <div className="hhwx-filter-label pt-2 text-sm font-medium text-[var(--theme-color-text-muted)]">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function BandoriCardFilterControls<TSortBy extends string>({
  className = "",
  filter,
  resultCountLabel,
  bandOptions,
  characterOptions,
  availableBandIds,
  availableCharacterIds,
  availableServers,
  sortOptions,
  onFilterChange,
  onClearFilter,
}: BandoriCardFilterControlsProps<TSortBy>) {
  const t = useTranslations("bandori.cardFilters");
  const typeT = useTranslations("bandori.cards.types");
  const selectedTypes = filter.types ?? [...BANDORI_CARD_CATALOG_TYPES];
  const typeOptions = BANDORI_CARD_CATALOG_TYPES.map((value) => ({ value, label: typeT(value) }));
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchInputRef.current) searchInputRef.current.value = filter.query;
  }, [filter.query]);
  const allLabel = t("actions.all");
  const bandLabel = t("rows.band");
  const attributeLabel = t("rows.attribute");
  const rarityLabel = t("rows.rarity");
  const characterLabel = t("rows.character");
  const serverLabel = t("rows.serverAvailability");

  return (
    <div className={`hhwx-panel border p-4 ${className}`}>
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
                if (
                  event.currentTarget.value === ""
                  && filter.query !== ""
                  && !(event.nativeEvent as InputEvent).isComposing
                ) onFilterChange({ query: "" });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.stopPropagation();
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
                  event.preventDefault();
                }
              }}
              enterKeyHint="search"
              aria-label={t("searchPlaceholder")}
              placeholder={t("searchPlaceholder")}
              className="hhwx-control h-10 w-full rounded-xl border pl-9 pr-3 text-sm transition"
            />
          </div>
          <button
            type="submit"
            aria-label={t("actions.search")}
            className="hhwx-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          <BandoriSearchHelp kind="cards" />
        </form>
        <div className="flex items-center gap-2">
          <BandoriFilterResultCount label={resultCountLabel} />
          <button
            type="button"
            onClick={() => {
              if (searchInputRef.current) searchInputRef.current.value = "";
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
          {availableServers.map((server) => {
            const code = getBandoriServerCode(server).toUpperCase();
            return (
              <SelectionButton
                key={server}
                title={code}
                ariaLabel={t("serverAvailabilityAria", { server: code })}
                isSelected={filter.servers.includes(server)}
                onClick={() => onFilterChange({ servers: toggleSelection(filter.servers, server) })}
                className="gap-1.5 px-2.5"
              >
                <BandoriServerIcon server={server} size={22} isDecorative />
                <span className="text-xs font-black">{code}</span>
              </SelectionButton>
            );
          })}
          <ToggleAllButton
            isSelected={areAllSelected(filter.servers, availableServers)}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: serverLabel })}
            clearAllLabel={t("actions.clearAllGroup", { group: serverLabel })}
            onClick={() => onFilterChange({
              servers: areAllSelected(filter.servers, availableServers) ? [] : availableServers,
            })}
          />
        </FilterRow>

        <FilterRow label={bandLabel}>
          {bandOptions.map((option) => {
            const bandIconUrl = buildBandoriCardBandIconUrl(option.bandId);
            return (
              <SelectionButton
                key={option.bandId}
                title={option.label}
                isSelected={filter.bandIds.includes(option.bandId)}
                onClick={() => onFilterChange({ bandIds: toggleSelection(filter.bandIds, option.bandId) })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {bandIconUrl ? <img src={bandIconUrl} alt={option.label} loading="lazy" decoding="async" className="h-7 w-7 object-contain" /> : null}
              </SelectionButton>
            );
          })}
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
                <img src={buildBandoriCardAttributeIconUrl(attribute) ?? undefined} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
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
              <img src={buildBandoriLegacyRarityCompositeUrl(rarity) ?? undefined} alt={t("rarityAlt", { rarity })} loading="lazy" decoding="async" className="h-5 w-5 object-contain" />
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
              <img src={buildBandoriCharacterIconUrl(option.characterId) ?? undefined} alt={option.label} loading="lazy" decoding="async" className="h-6 w-6 rounded-full object-cover" />
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

        <FilterRow label={t("rows.type")}>
          {typeOptions.map((option) => (
            <SelectionButton
              key={option.value}
              title={option.label}
              isSelected={selectedTypes.includes(option.value)}
              onClick={() => onFilterChange({ types: toggleSelection(selectedTypes, option.value) })}
              className="px-3 text-xs"
            >
              {option.label}
            </SelectionButton>
          ))}
          <ToggleAllButton
            isSelected={areAllSelected(selectedTypes, typeOptions.map((option) => option.value))}
            allLabel={allLabel}
            selectAllLabel={t("actions.selectAllGroup", { group: t("rows.type") })}
            clearAllLabel={t("actions.clearAllGroup", { group: t("rows.type") })}
            onClick={() => onFilterChange({ types:
              areAllSelected(selectedTypes, typeOptions.map((option) => option.value))
                ? []
                : [...BANDORI_CARD_CATALOG_TYPES],
            })}
          />
        </FilterRow>

        <FilterRow label={t("rows.sort")}>
          <select
            value={filter.sortBy}
            onChange={(event) => onFilterChange({ sortBy: event.target.value as TSortBy })}
            aria-label={t("rows.sort")}
            className="hhwx-control h-10 min-w-64 rounded-xl border px-3 text-sm transition"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onFilterChange({ sortDirection: filter.sortDirection === "desc" ? "asc" : "desc" })}
            className="hhwx-control inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition"
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
