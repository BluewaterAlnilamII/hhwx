"use client";

import { type ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Search, X } from "lucide-react";
import { type BandoriCardPickerSortBy } from "@/components/bandori/card-picker";
import { buildBandoriResIconPublicUrl } from "@/lib/bandori-asset-proxy";
import { type BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import { type TeamBuilderPreferenceCardMetadata } from "./useTeamBuilderPreferenceCardEntries";

export type TeamBuilderExcludedCardSortBy = BandoriCardPickerSortBy | "power";

export type TeamBuilderExcludedCardFilterState = {
  query: string;
  bandIds: number[];
  attributes: BandoriCardAttribute[];
  rarities: number[];
  characterIds: number[];
  sortBy: TeamBuilderExcludedCardSortBy;
  sortDirection: "desc" | "asc";
};

type BandFilterOption = {
  bandId: number;
  label: string;
};

type CharacterFilterOption = {
  characterId: number;
  label: string;
};

type ExcludedCardFilterControlsProps = {
  filter: TeamBuilderExcludedCardFilterState;
  resultCountLabel: string;
  bandOptions: BandFilterOption[];
  characterOptions: CharacterFilterOption[];
  bandIds: number[];
  characterIds: number[];
  onFilterChange: (patch: Partial<TeamBuilderExcludedCardFilterState>) => void;
  onClearFilter: () => void;
};

const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "Powerful",
  cool: "Cool",
  happy: "Happy",
  pure: "Pure",
};

const ATTRIBUTE_SWATCH_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "bg-rose-500",
  cool: "bg-sky-500",
  happy: "bg-amber-400",
  pure: "bg-emerald-500",
};

const CARD_FILTER_ATTRIBUTE_OPTIONS: Array<{ value: BandoriCardAttribute; label: string }> = [
  { value: "powerful", label: ATTRIBUTE_LABELS.powerful },
  { value: "cool", label: ATTRIBUTE_LABELS.cool },
  { value: "happy", label: ATTRIBUTE_LABELS.happy },
  { value: "pure", label: ATTRIBUTE_LABELS.pure },
];

export const CARD_FILTER_ATTRIBUTE_VALUES = CARD_FILTER_ATTRIBUTE_OPTIONS.map((option) => option.value);
export const CARD_FILTER_RARITY_OPTIONS = [1, 2, 3, 4, 5];

const CARD_FILTER_SORT_OPTIONS: Array<{ value: TeamBuilderExcludedCardSortBy; label: string }> = [
  { value: "power", label: "综合力" },
  { value: "release_jp", label: "发布日期（JP）" },
  { value: "release_cn", label: "发布日期（CN）" },
  { value: "id", label: "卡牌 ID" },
];

function buildBandoriCharacterIconUrl(characterId: number): string {
  return buildBandoriResIconPublicUrl(`chara_icon_${characterId}.png`);
}

function buildBandoriRarityIconUrl(rarity: number): string {
  return buildBandoriResIconPublicUrl(`star_${Math.max(1, Math.min(5, Math.trunc(rarity)))}.png`);
}

function buildBandoriAttributeIconUrl(attribute: BandoriCardAttribute): string {
  return buildBandoriResIconPublicUrl(`${attribute}.svg`);
}

function AttributeIcon({ attribute }: { attribute: BandoriCardAttribute }) {
  const iconUrl = buildBandoriAttributeIconUrl(attribute);

  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${ATTRIBUTE_SWATCH_CLASSES[attribute]}`}
      title={ATTRIBUTE_LABELS[attribute]}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt=""
        className="h-full w-full object-contain"
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

function CharacterIcon({ characterId, label }: { characterId: number; label: string }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200" title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildBandoriCharacterIconUrl(characterId)}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

function RarityIcon({ rarity }: { rarity: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriRarityIconUrl(rarity)}
      alt={`${rarity}星`}
      className="h-5 w-5 shrink-0 object-contain"
      loading="lazy"
      decoding="async"
    />
  );
}

function toggleCardFilterSelection<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function areAllCardFilterOptionsSelected<T>(selectedValues: readonly T[], availableValues: readonly T[]): boolean {
  return availableValues.length > 0 && availableValues.every((value) => selectedValues.includes(value));
}

export function buildDefaultExcludedCardFilter(
  bandIds: number[],
  characterIds: number[],
): TeamBuilderExcludedCardFilterState {
  return {
    query: "",
    bandIds,
    attributes: CARD_FILTER_ATTRIBUTE_VALUES,
    rarities: CARD_FILTER_RARITY_OPTIONS,
    characterIds,
    sortBy: "power",
    sortDirection: "desc",
  };
}

export function readCardReleaseTimestamp(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  sortBy: TeamBuilderExcludedCardSortBy,
): number {
  if (sortBy === "id") {
    return 0;
  }
  const index = sortBy === "release_cn" ? 3 : 0;
  const value = metadata?.releasedAt?.[index];
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function CardFilterSelectionButton({
  selected,
  title,
  children,
  onClick,
  className = "",
}: {
  selected: boolean;
  title: string;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full border bg-white px-2 text-sm font-semibold text-slate-700 shadow-sm transition ${
        selected
          ? "border-blue-500 ring-2 ring-blue-400/70"
          : "border-slate-200 hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function CardFilterToggleAllButton({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <CardFilterSelectionButton
      selected={selected}
      title={selected ? "取消全部" : "选择全部"}
      onClick={onClick}
      className="min-w-[3.25rem] rounded-full px-3 text-xs"
    >
      全部
    </CardFilterSelectionButton>
  );
}

function CardFilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <div className="pt-2 text-sm font-medium text-slate-600">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function ExcludedCardFilterControls({
  filter,
  resultCountLabel,
  bandOptions,
  characterOptions,
  bandIds,
  characterIds,
  onFilterChange,
  onClearFilter,
}: ExcludedCardFilterControlsProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={filter.query}
            onChange={(event) => onFilterChange({ query: event.target.value })}
            placeholder="搜索卡牌名称、角色名或卡牌 ID"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
            清空
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <CardFilterRow label="乐队">
          {bandOptions.map((option) => (
            <CardFilterSelectionButton
              key={option.bandId}
              title={option.label}
              selected={filter.bandIds.includes(option.bandId)}
              onClick={() => onFilterChange({
                bandIds: toggleCardFilterSelection(filter.bandIds, option.bandId),
              })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildBandoriResIconPublicUrl(`band_${option.bandId}.svg`)}
                alt={option.label}
                loading="lazy"
                decoding="async"
                className="h-7 w-7 object-contain"
              />
            </CardFilterSelectionButton>
          ))}
          <CardFilterToggleAllButton
            selected={areAllCardFilterOptionsSelected(filter.bandIds, bandIds)}
            onClick={() => onFilterChange({
              bandIds: areAllCardFilterOptionsSelected(filter.bandIds, bandIds) ? [] : bandIds,
            })}
          />
        </CardFilterRow>

        <CardFilterRow label="属性">
          {CARD_FILTER_ATTRIBUTE_OPTIONS.map((option) => (
            <CardFilterSelectionButton
              key={option.value}
              title={option.label}
              selected={filter.attributes.includes(option.value)}
              onClick={() => onFilterChange({
                attributes: toggleCardFilterSelection(filter.attributes, option.value),
              })}
            >
              <AttributeIcon attribute={option.value} />
            </CardFilterSelectionButton>
          ))}
          <CardFilterToggleAllButton
            selected={areAllCardFilterOptionsSelected(filter.attributes, CARD_FILTER_ATTRIBUTE_VALUES)}
            onClick={() => onFilterChange({
              attributes: areAllCardFilterOptionsSelected(filter.attributes, CARD_FILTER_ATTRIBUTE_VALUES)
                ? []
                : CARD_FILTER_ATTRIBUTE_VALUES,
            })}
          />
        </CardFilterRow>

        <CardFilterRow label="稀有度">
          {CARD_FILTER_RARITY_OPTIONS.map((rarity) => (
            <CardFilterSelectionButton
              key={rarity}
              title={`${rarity} 星`}
              selected={filter.rarities.includes(rarity)}
              onClick={() => onFilterChange({
                rarities: toggleCardFilterSelection(filter.rarities, rarity),
              })}
            >
              <RarityIcon rarity={rarity} />
            </CardFilterSelectionButton>
          ))}
          <CardFilterToggleAllButton
            selected={areAllCardFilterOptionsSelected(filter.rarities, CARD_FILTER_RARITY_OPTIONS)}
            onClick={() => onFilterChange({
              rarities: areAllCardFilterOptionsSelected(filter.rarities, CARD_FILTER_RARITY_OPTIONS)
                ? []
                : CARD_FILTER_RARITY_OPTIONS,
            })}
          />
        </CardFilterRow>

        <CardFilterRow label="角色">
          {characterOptions.map((option) => (
            <CardFilterSelectionButton
              key={option.characterId}
              title={option.label}
              selected={filter.characterIds.includes(option.characterId)}
              onClick={() => onFilterChange({
                characterIds: toggleCardFilterSelection(filter.characterIds, option.characterId),
              })}
            >
              <CharacterIcon characterId={option.characterId} label={option.label} />
            </CardFilterSelectionButton>
          ))}
          <CardFilterToggleAllButton
            selected={areAllCardFilterOptionsSelected(filter.characterIds, characterIds)}
            onClick={() => onFilterChange({
              characterIds: areAllCardFilterOptionsSelected(filter.characterIds, characterIds) ? [] : characterIds,
            })}
          />
        </CardFilterRow>

        <CardFilterRow label="排序">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <select
              value={filter.sortBy}
              onChange={(event) => onFilterChange({ sortBy: event.target.value as TeamBuilderExcludedCardSortBy })}
              className="h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
              {CARD_FILTER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onFilterChange({
                sortDirection: filter.sortDirection === "desc" ? "asc" : "desc",
              })}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
              title={filter.sortDirection === "desc" ? "当前为倒序，点击切换为正序" : "当前为正序，点击切换为倒序"}
              aria-label={filter.sortDirection === "desc" ? "排序方向：倒序" : "排序方向：正序"}
            >
              {filter.sortDirection === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" /> : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}
              {filter.sortDirection === "desc" ? "倒序" : "正序"}
            </button>
          </div>
        </CardFilterRow>
      </div>
    </div>
  );
}
