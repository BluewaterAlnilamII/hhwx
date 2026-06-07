"use client";

import { useDeferredValue, useEffect, useMemo, useState, type RefObject } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter, Loader2, RotateCcw, Search, X } from "lucide-react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import {
  buildBandoriResIconPublicUrl,
  type BandoriAssetRegion,
} from "@/lib/bandori-asset-proxy";
import { BANDORI_CHARACTER_GROUPS, compareBandoriCharacterIds } from "@/lib/bandori-character-groups";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import { cn } from "@/lib/utils";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import {
  bandoriCardCatalogTransforms,
  buildBandoriCardCatalog,
  filterBandoriCardCatalog,
} from "./catalog";
import BandoriCardThumbnailTile from "./BandoriCardThumbnailTile";
import type {
  BandoriCardArtVariant,
  BandoriCardAttribute,
  BandoriCardCatalogEntry,
  BandoriCardPickerFilter,
  BandoriCardPickerSortBy,
  BandoriCardPickerSortDirection,
  BandoriCardPickerValue,
} from "./types";

const ATTRIBUTE_OPTIONS: Array<{ value: BandoriCardAttribute; label: string }> = [
  { value: "powerful", label: "强力" },
  { value: "cool", label: "酷" },
  { value: "happy", label: "快乐" },
  { value: "pure", label: "纯粹" },
];

const ATTRIBUTE_VALUES = ATTRIBUTE_OPTIONS.map((option) => option.value);
const RARITY_OPTIONS = [1, 2, 3, 4, 5];
const SORT_OPTIONS: Array<{ value: BandoriCardPickerSortBy; label: string }> = [
  { value: "release_jp", label: "发布日期（JP）" },
  { value: "release_cn", label: "发布日期（CN）" },
  { value: "id", label: "卡牌 ID" },
];
const INITIAL_VISIBLE_COUNT = 60;
const PAGE_SIZE = 60;
const PREFERENCES_STORAGE_KEY = "hhwx-bandori-card-picker-preferences-v1";

const DEFAULT_FILTER: BandoriCardPickerFilter = {
  query: "",
  bandIds: [],
  attributes: [],
  rarities: [],
  characterIds: [],
  sortBy: "release_jp",
  sortDirection: "desc",
};

type BandoriCardPickerPreferences = Omit<BandoriCardPickerFilter, "query">;

function isSortBy(value: unknown): value is BandoriCardPickerSortBy {
  return value === "release_jp" || value === "release_cn" || value === "id";
}

function isSortDirection(value: unknown): value is BandoriCardPickerSortDirection {
  return value === "desc" || value === "asc";
}

function normalizeSelectedNumbers(value: unknown, availableValues: readonly number[]): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const available = new Set(availableValues);
  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && available.has(item)),
  ));
}

function normalizeSelectedAttributes(value: unknown): BandoriCardAttribute[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const available = new Set(ATTRIBUTE_VALUES);
  return Array.from(new Set(value.filter((item): item is BandoriCardAttribute => available.has(item))));
}

function buildDefaultFilter(bandIds: number[], characterIds: number[]): BandoriCardPickerFilter {
  return {
    ...DEFAULT_FILTER,
    bandIds,
    attributes: ATTRIBUTE_VALUES,
    rarities: RARITY_OPTIONS,
    characterIds,
  };
}

function readStoredPreferences(
  bandIds: number[],
  characterIds: number[],
): BandoriCardPickerPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<BandoriCardPickerPreferences>;
    return {
      bandIds: normalizeSelectedNumbers(parsed.bandIds, bandIds) ?? bandIds,
      attributes: normalizeSelectedAttributes(parsed.attributes) ?? ATTRIBUTE_VALUES,
      rarities: normalizeSelectedNumbers(parsed.rarities, RARITY_OPTIONS) ?? RARITY_OPTIONS,
      characterIds: normalizeSelectedNumbers(parsed.characterIds, characterIds) ?? characterIds,
      sortBy: isSortBy(parsed.sortBy) ? parsed.sortBy : "release_jp",
      sortDirection: isSortDirection(parsed.sortDirection) ? parsed.sortDirection : "desc",
    };
  } catch {
    return null;
  }
}

function writeStoredPreferences(preferences: BandoriCardPickerPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore local preference write failures; filtering still works for this session.
  }
}

function toggleSelected<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function areAllSelected<T>(selectedValues: readonly T[], availableValues: readonly T[]): boolean {
  return availableValues.length > 0 && availableValues.every((value) => selectedValues.includes(value));
}

function SelectionButton({
  selected,
  title,
  children,
  onClick,
  className,
}: {
  selected: boolean;
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-full border bg-white px-2 text-sm font-semibold text-slate-700 shadow-sm transition",
        selected
          ? "border-blue-500 ring-2 ring-blue-400/70"
          : "border-slate-200 hover:border-blue-300 hover:ring-2 hover:ring-blue-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ToggleAllButton({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <SelectionButton
      selected={selected}
      title={selected ? "取消全部" : "选择全部"}
      onClick={onClick}
      className="min-w-[3.25rem] rounded-full px-3 text-xs"
    >
      全部
    </SelectionButton>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5.5rem_1fr] sm:items-start">
      <div className="pt-2 text-sm font-medium text-slate-600">{label}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function RarityIcon({ rarity }: { rarity: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriResIconPublicUrl(`star_${rarity}.png`)}
      alt={`${rarity} 星`}
      loading="eager"
      decoding="async"
      className="h-6 w-6 object-contain"
    />
  );
}

function CharacterIcon({ characterId, label }: { characterId: number; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriResIconPublicUrl(`chara_icon_${characterId}.png`)}
      alt={label}
      loading="eager"
      decoding="async"
      className="h-7 w-7 rounded-full object-cover"
    />
  );
}

function AttributeIcon({ attribute, label }: { attribute: BandoriCardAttribute; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriResIconPublicUrl(`${attribute}.svg`)}
      alt={label}
      loading="eager"
      decoding="async"
      className="h-7 w-7 object-contain"
    />
  );
}

function BandIcon({ bandId, label }: { bandId: number; label: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={buildBandoriResIconPublicUrl(`band_${bandId}.svg`)}
      alt={label}
      loading="eager"
      decoding="async"
      className="h-7 w-7 object-contain"
    />
  );
}

function ArtToggle({
  trainType,
  onChange,
}: {
  trainType: BandoriCardArtVariant;
  onChange: (nextTrainType: BandoriCardArtVariant) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onChange("normal")}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold transition",
          trainType === "normal" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
        )}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        特训前
      </button>
      <button
        type="button"
        onClick={() => onChange("after_training")}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 border-l border-slate-200 px-3 text-sm font-semibold transition",
          trainType === "after_training" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
        )}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        特训后
      </button>
    </div>
  );
}

function resolveCardTrainType(
  card: Pick<BandoriCardCatalogEntry, "hasTrainedArt">,
  trainType: BandoriCardArtVariant,
): BandoriCardArtVariant {
  return trainType === "after_training" && !card.hasTrainedArt ? "normal" : trainType;
}

function CardGridItem({
  card,
  selected,
  activeTrainType,
  region,
  skillEffectLabel,
  onSelect,
}: {
  card: BandoriCardCatalogEntry;
  selected: boolean;
  activeTrainType: BandoriCardPickerValue["trainType"];
  region: BandoriAssetRegion;
  skillEffectLabel: string;
  onSelect: () => void;
}) {
  return (
    <BandoriCardThumbnailTile
      card={card}
      selected={selected}
      trainType={activeTrainType}
      region={region}
      skillEffectLabel={skillEffectLabel}
      onSelect={onSelect}
    />
  );
}

export type BandoriCardPickerProps = {
  value: BandoriCardPickerValue | null;
  onValueChange: (value: BandoriCardPickerValue | null) => void;
  region?: BandoriAssetRegion;
  className?: string;
  showArtToggle?: boolean;
  scrollElementRef?: RefObject<HTMLElement | null>;
};

export default function BandoriCardPicker({
  value,
  onValueChange,
  region = "cn",
  className,
  showArtToggle = true,
  scrollElementRef,
}: BandoriCardPickerProps) {
  const { data: cardMetadata, loading: cardsLoading } = useCachedFetch(
    "bandori-card-picker-cards-v3",
    "/api/bandori/master/cards",
    bandoriCardCatalogTransforms.cards,
    { staleTimeMs: 86400000 },
  );
  const { data: characterMetadata, loading: charactersLoading } = useCachedFetch(
    "bandori-card-picker-characters-v3",
    "/api/bandori/master/characters",
    bandoriCardCatalogTransforms.characters,
    { staleTimeMs: 86400000 },
  );
  const { data: skillMetadata, loading: skillsLoading } = useCachedFetch<Record<string, BandoriSkillLabelMaster | null | undefined>>(
    "bandori-card-picker-skills-v1",
    "/api/bandori/master/skills",
    bandoriCardCatalogTransforms.skills,
    { staleTimeMs: 86400000 },
  );
  const [filter, setFilter] = useState<BandoriCardPickerFilter>(DEFAULT_FILTER);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [previewTrainType, setPreviewTrainType] = useState<BandoriCardArtVariant>(() => value?.trainType ?? "after_training");
  const deferredQuery = useDeferredValue(filter.query);
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });
  const loading = cardsLoading || charactersLoading || skillsLoading;

  const catalog = useMemo(
    () => buildBandoriCardCatalog(cardMetadata ?? {}, characterMetadata ?? {}),
    [cardMetadata, characterMetadata],
  );

  const characterNameById = useMemo(() => {
    const mapped = new Map<number, string>();
    catalog.forEach((card) => {
      if (!mapped.has(card.characterId)) {
        mapped.set(card.characterId, card.characterName);
      }
    });
    return mapped;
  }, [catalog]);

  const bandOptions = useMemo(() => {
    const knownLabels = new Map(BANDORI_CHARACTER_GROUPS.map((group) => [group.bandId, group.label]));
    const uniqueBandIds = Array.from(new Set(catalog.flatMap((card) => card.bandId === null ? [] : [card.bandId])));
    return uniqueBandIds
      .sort((left, right) => left - right)
      .map((bandId) => ({
        bandId,
        label: knownLabels.get(bandId) ?? `Band ${bandId}`,
      }));
  }, [catalog]);

  const characterOptions = useMemo(() => {
    return Array.from(characterNameById.entries())
      .map(([characterId, label]) => ({ characterId, label }))
      .sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId));
  }, [characterNameById]);

  const bandIds = useMemo(() => bandOptions.map((option) => option.bandId), [bandOptions]);
  const characterIds = useMemo(() => characterOptions.map((option) => option.characterId), [characterOptions]);
  const persistedPreferences = useMemo<BandoriCardPickerPreferences>(() => ({
    bandIds: filter.bandIds,
    attributes: filter.attributes,
    rarities: filter.rarities,
    characterIds: filter.characterIds,
    sortBy: filter.sortBy,
    sortDirection: filter.sortDirection,
  }), [
    filter.attributes,
    filter.bandIds,
    filter.characterIds,
    filter.rarities,
    filter.sortBy,
    filter.sortDirection,
  ]);
  const deferredFilter = useMemo<BandoriCardPickerFilter>(() => ({
    ...persistedPreferences,
    query: deferredQuery,
  }), [deferredQuery, persistedPreferences]);

  useEffect(() => {
    if (preferencesReady || loading || bandIds.length === 0 || characterIds.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      const storedPreferences = readStoredPreferences(bandIds, characterIds);
      setFilter((current) => ({
        ...(storedPreferences ? { ...DEFAULT_FILTER, ...storedPreferences } : buildDefaultFilter(bandIds, characterIds)),
        query: current.query,
      }));
      setPreferencesReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [bandIds, characterIds, loading, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) {
      return;
    }

    writeStoredPreferences(persistedPreferences);
  }, [persistedPreferences, preferencesReady]);

  const filteredCards = useMemo(
    () => filterBandoriCardCatalog(catalog, deferredFilter),
    [catalog, deferredFilter],
  );

  const filterKey = useMemo(
    () => JSON.stringify({
      query: deferredQuery,
      bandIds: filter.bandIds,
      attributes: filter.attributes,
      rarities: filter.rarities,
      characterIds: filter.characterIds,
      sortBy: filter.sortBy,
      sortDirection: filter.sortDirection,
    }),
    [deferredQuery, filter.attributes, filter.bandIds, filter.characterIds, filter.rarities, filter.sortBy, filter.sortDirection],
  );

  const selectedCard = useMemo(
    () => catalog.find((card) => card.cardId === value?.cardId) ?? null,
    [catalog, value?.cardId],
  );
  const virtualGridLayoutKey = useMemo(
    () => [
      showArtToggle ? "art-toggle" : "no-art-toggle",
      value?.cardId ?? "no-card",
      value?.trainType ?? "no-train-type",
    ].join(":"),
    [showArtToggle, value?.cardId, value?.trainType],
  );

  const visibleCount = visibleState.key === filterKey ? visibleState.count : INITIAL_VISIBLE_COUNT;
  const visibleCardCount = Math.min(visibleCount, filteredCards.length);
  const hiddenCardCount = Math.max(0, filteredCards.length - visibleCardCount);

  const updateFilter = (patch: Partial<BandoriCardPickerFilter>) => {
    setFilter((current) => ({ ...current, ...patch }));
  };

  const handlePreviewTrainTypeChange = (nextTrainType: BandoriCardArtVariant) => {
    setPreviewTrainType(nextTrainType);
    if (!value) {
      return;
    }

    const nextValueTrainType = selectedCard
      ? resolveCardTrainType(selectedCard, nextTrainType)
      : nextTrainType;
    onValueChange({ ...value, trainType: nextValueTrainType });
  };

  const handleCardSelect = (card: BandoriCardCatalogEntry) => {
    onValueChange({
      cardId: card.cardId,
      trainType: resolveCardTrainType(card, previewTrainType),
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={filter.query}
              onChange={(event) => updateFilter({ query: event.target.value })}
              placeholder="搜索卡牌名称、角色名或卡牌 ID"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {filteredCards.length} 张
            </span>
            <button
              type="button"
              onClick={() => setFilter(DEFAULT_FILTER)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              清空
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <FilterRow label="乐队">
            {bandOptions.map((group) => (
              <SelectionButton
                key={group.bandId}
                title={group.label}
                selected={filter.bandIds.includes(group.bandId)}
                onClick={() => updateFilter({ bandIds: toggleSelected(filter.bandIds, group.bandId) })}
              >
                <BandIcon bandId={group.bandId} label={group.label} />
              </SelectionButton>
            ))}
            <ToggleAllButton
              selected={areAllSelected(filter.bandIds, bandIds)}
              onClick={() => updateFilter({ bandIds: areAllSelected(filter.bandIds, bandIds) ? [] : bandIds })}
            />
          </FilterRow>

          <FilterRow label="属性">
            {ATTRIBUTE_OPTIONS.map((option) => (
              <SelectionButton
                key={option.value}
                title={option.label}
                selected={filter.attributes.includes(option.value)}
                onClick={() => updateFilter({ attributes: toggleSelected(filter.attributes, option.value) })}
              >
                <AttributeIcon attribute={option.value} label={option.label} />
              </SelectionButton>
            ))}
            <ToggleAllButton
              selected={areAllSelected(filter.attributes, ATTRIBUTE_VALUES)}
              onClick={() => {
                updateFilter({ attributes: areAllSelected(filter.attributes, ATTRIBUTE_VALUES) ? [] : ATTRIBUTE_VALUES });
              }}
            />
          </FilterRow>

          <FilterRow label="稀有度">
            {RARITY_OPTIONS.map((rarity) => (
              <SelectionButton
                key={rarity}
                title={`${rarity} 星`}
                selected={filter.rarities.includes(rarity)}
                onClick={() => updateFilter({ rarities: toggleSelected(filter.rarities, rarity) })}
              >
                <RarityIcon rarity={rarity} />
              </SelectionButton>
            ))}
            <ToggleAllButton
              selected={areAllSelected(filter.rarities, RARITY_OPTIONS)}
              onClick={() => updateFilter({ rarities: areAllSelected(filter.rarities, RARITY_OPTIONS) ? [] : RARITY_OPTIONS })}
            />
          </FilterRow>

          <FilterRow label="角色">
            {characterOptions.map(({ characterId, label }) => (
              <SelectionButton
                key={characterId}
                title={label}
                selected={filter.characterIds.includes(characterId)}
                onClick={() => updateFilter({ characterIds: toggleSelected(filter.characterIds, characterId) })}
              >
                <CharacterIcon characterId={characterId} label={label} />
              </SelectionButton>
            ))}
            <ToggleAllButton
              selected={areAllSelected(filter.characterIds, characterIds)}
              onClick={() => updateFilter({ characterIds: areAllSelected(filter.characterIds, characterIds) ? [] : characterIds })}
            />
          </FilterRow>

          <FilterRow label="排序">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <select
                value={filter.sortBy}
                onChange={(event) => updateFilter({ sortBy: event.target.value as BandoriCardPickerSortBy })}
                className="h-10 min-w-64 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => updateFilter({ sortDirection: filter.sortDirection === "desc" ? "asc" : "desc" })}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-600"
                title={filter.sortDirection === "desc" ? "当前为倒序，点击切换为正序" : "当前为正序，点击切换为倒序"}
                aria-label={filter.sortDirection === "desc" ? "排序方向：倒序" : "排序方向：正序"}
              >
                {filter.sortDirection === "desc" ? <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" /> : <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" />}
                {filter.sortDirection === "desc" ? "倒序" : "正序"}
              </button>
            </div>
          </FilterRow>
        </div>
      </div>

      {value && showArtToggle ? (
        <div className="sticky top-[-0.75rem] z-[80] -mx-3 bg-slate-50/95 px-3 pb-2 pt-3 backdrop-blur sm:top-[-1.25rem] sm:-mx-5 sm:px-5 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm">
            <div className="min-w-0 text-sm text-slate-600">
            当前选择：
            <span className="font-semibold text-slate-900">
              {selectedCard ? `${selectedCard.displayName} / #${selectedCard.cardId}` : `Card #${value.cardId}`}
            </span>
          </div>
            <ArtToggle
              trainType={previewTrainType}
              onChange={handlePreviewTrainTypeChange}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-[#fffdf1]/72 p-3 shadow-inner">
        {loading && catalog.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            正在读取卡牌
          </div>
        ) : filteredCards.length > 0 ? (
          <>
            <VirtualizedBandoriCardGrid
              items={filteredCards}
              visibleLimit={visibleCount}
              scrollElementRef={scrollElementRef}
              layoutKey={virtualGridLayoutKey}
              getKey={(card) => card.cardId}
              renderItem={(card) => {
                const selected = value?.cardId === card.cardId;
                const activeTrainType = resolveCardTrainType(card, previewTrainType);
                return (
                  <CardGridItem
                    key={card.cardId}
                    card={card}
                    selected={selected}
                    activeTrainType={activeTrainType}
                    region={region}
                    skillEffectLabel={normalizeBandoriSkillLabel(card.skillId ? skillMetadata?.[String(card.skillId)] ?? undefined : undefined, 5, 5)}
                    onSelect={() => handleCardSelect(card)}
                  />
                );
              }}
            />
            {hiddenCardCount > 0 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleState({
                    key: filterKey,
                    count: Math.min(visibleCount + PAGE_SIZE, filteredCards.length),
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                >
                  显示更多 {Math.min(PAGE_SIZE, hiddenCardCount)} 张
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleState({ key: filterKey, count: filteredCards.length })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-600"
                >
                  显示全部
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-56 items-center justify-center text-sm font-semibold text-slate-500">
            没有符合条件的卡牌
          </div>
        )}
      </div>
    </div>
  );
}
