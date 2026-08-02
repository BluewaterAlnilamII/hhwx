"use client";

import { useDeferredValue, useMemo, useState, type RefObject } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import BandoriCardFilterControls from "@/components/bandori/BandoriCardFilterControls";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import {
  useBandoriCardsMaster,
  type BandoriCardsMissingCardFallback,
} from "@/hooks/useBandoriCardsMaster";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { type BandoriCardServer } from "@/lib/bandori-card-server-extensions";
import { type BandoriCharacterMaster, type BandoriSkillMaster } from "@/lib/bandori-card-master";
import { type BandoriCardsMasterMap } from "@/lib/bandori-cards-api-client";
import {
  resolveBandoriSkillLabel,
} from "@/lib/bandori-skill-label";
import type { BandoriServerLanguageTag } from "@/lib/bandori-server";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  buildBandoriCardFilterOptions,
  buildBandoriCardSortValues,
  reconcileBandoriCardFilterSelection,
} from "@/lib/bandori-card-filter";
import { cn } from "@/lib/utils";
import VirtualizedBandoriCardGrid from "@/components/bandori/VirtualizedBandoriCardGrid";
import { buildBandoriCardCatalog, filterBandoriCardCatalog } from "./catalog";
import BandoriCardThumbnailTile from "./BandoriCardThumbnailTile";
import type {
  BandoriCardArtVariant,
  BandoriCardAttribute,
  BandoriCardCatalogEntry,
  BandoriCardPickerFilter,
  BandoriCardPickerValue,
} from "./types";

const ATTRIBUTE_VALUES: BandoriCardAttribute[] = [...BANDORI_CARD_ATTRIBUTES];
const RARITY_OPTIONS = [...BANDORI_CARD_RARITIES];
const INITIAL_VISIBLE_COUNT = 60;
const PAGE_SIZE = 60;

const DEFAULT_FILTER: BandoriCardPickerFilter = {
  query: "",
  bandIds: [],
  attributes: [],
  rarities: [],
  characterIds: [],
  sortBy: "id",
  sortDirection: "desc",
};

function buildDefaultFilter(bandIds: number[], characterIds: number[]): BandoriCardPickerFilter {
  return {
    ...DEFAULT_FILTER,
    bandIds,
    attributes: ATTRIBUTE_VALUES,
    rarities: RARITY_OPTIONS,
    characterIds,
  };
}

function ArtToggle({
  trainType,
  normalLabel,
  afterTrainingLabel,
  onChange,
}: {
  trainType: BandoriCardArtVariant;
  normalLabel: string;
  afterTrainingLabel: string;
  onChange: (nextTrainType: BandoriCardArtVariant) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <button
        type="button"
        onClick={() => onChange("normal")}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-semibold transition",
          trainType === "normal" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50",
        )}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {normalLabel}
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
        {afterTrainingLabel}
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
  isSelected,
  isMuted,
  activeTrainType,
  skillEffectLabel,
  skillEffectLanguageTag,
  onSelect,
}: {
  card: BandoriCardCatalogEntry;
  isSelected: boolean;
  isMuted: boolean;
  activeTrainType: BandoriCardPickerValue["trainType"];
  skillEffectLabel: string;
  skillEffectLanguageTag: BandoriServerLanguageTag;
  onSelect: () => void;
}) {
  return (
    <BandoriCardThumbnailTile
      card={card}
      isSelected={isSelected}
      isMuted={isMuted}
      trainType={activeTrainType}
      skillEffectLabel={skillEffectLabel}
      skillEffectLanguageTag={skillEffectLanguageTag}
      onSelect={onSelect}
    />
  );
}

export type BandoriCardPickerProps = {
  value: BandoriCardPickerValue | null;
  onValueChange: (value: BandoriCardPickerValue | null) => void;
  server?: BandoriCardServer;
  missingCardFallback?: BandoriCardsMissingCardFallback;
  className?: string;
  showArtToggle?: boolean;
  scrollElementRef?: RefObject<HTMLElement | null>;
  cardMetadata?: BandoriCardsMasterMap;
  characters?: Record<string, BandoriCharacterMaster | null | undefined>;
  skills?: Record<string, BandoriSkillMaster | null | undefined>;
  mutedCardIds?: ReadonlySet<number>;
};

export default function BandoriCardPicker({
  value,
  onValueChange,
  server,
  missingCardFallback = "none",
  className,
  showArtToggle = true,
  scrollElementRef,
  cardMetadata: providedCardMetadata,
  characters,
  skills,
  mutedCardIds,
}: BandoriCardPickerProps) {
  const t = useTranslations("bandori.cardPicker");
  const filterT = useTranslations("bandori.cardFilters");
  const termsT = useTranslations("bandori.terms");
  const preferredServer = useBandoriPreferredServer();
  const sortValues = useMemo(
    () => buildBandoriCardSortValues({
      shouldIncludePower: false,
      contextServer: server,
    }),
    [server],
  );
  useBandoriCardsAssetIndex();
  const cardsMaster = useBandoriCardsMaster(
    server,
    providedCardMetadata === undefined,
    missingCardFallback,
  );
  const cardMetadata = providedCardMetadata ?? cardsMaster.data;
  const charactersMaster = useBandoriCharactersMaster(characters === undefined);
  const skillsMaster = useBandoriSkillsMaster(skills === undefined);
  const characterMetadata = characters ?? charactersMaster.data;
  const skillMetadata = skills ?? skillsMaster.data;
  const [storedFilterState, setStoredFilterState] = useState<{
    filter: BandoriCardPickerFilter;
    availableBandIds: number[];
    availableCharacterIds: number[];
  } | null>(null);
  const [previewTrainType, setPreviewTrainType] = useState<BandoriCardArtVariant>(() => value?.trainType ?? "after_training");
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });
  const isLoading = (providedCardMetadata === undefined && cardsMaster.loading)
    || (characters === undefined && charactersMaster.loading)
    || (skills === undefined && skillsMaster.loading);
  const sortOptions = useMemo(
    () => sortValues.map((value) => ({ value, label: filterT(`sort.${value}`) })),
    [filterT, sortValues],
  );
  const catalog = useMemo(
    () => {
      const cards = buildBandoriCardCatalog(
        cardMetadata ?? {},
        (characterMetadata ?? {}) as Parameters<typeof buildBandoriCardCatalog>[1],
        preferredServer,
        server === undefined,
        server,
        {
          getCardLabel: (cardId) => t("cardFallback", { cardId }),
          getCharacterLabel: (characterId) => filterT("characterFallback", { characterId }),
        },
      );
      return cards;
    },
    [
      cardMetadata,
      characterMetadata,
      filterT,
      preferredServer,
      server,
      t,
    ],
  );

  const { bandOptions, characterOptions, bandIds, characterIds } = useMemo(
    () => buildBandoriCardFilterOptions(characterMetadata ?? {}, {
      preferredServer,
      contextServer: server,
      getBandLabel: (bandId) => filterT("bandFallback", { bandId }),
      getCharacterLabel: (characterId) => filterT("characterFallback", { characterId }),
    }),
    [characterMetadata, filterT, preferredServer, server],
  );
  const effectiveFilter = useMemo<BandoriCardPickerFilter>(() => {
    const defaultFilter = buildDefaultFilter(bandIds, characterIds);
    if (!storedFilterState) return defaultFilter;
    const hasAvailableSort = sortValues.includes(storedFilterState.filter.sortBy);
    return {
      ...storedFilterState.filter,
      bandIds: reconcileBandoriCardFilterSelection(
        storedFilterState.filter.bandIds,
        storedFilterState.availableBandIds,
        bandIds,
      ),
      attributes: storedFilterState.filter.attributes.filter(
        (attribute) => BANDORI_CARD_ATTRIBUTES.includes(attribute),
      ),
      rarities: storedFilterState.filter.rarities.filter(
        (rarity) => BANDORI_CARD_RARITIES.includes(rarity),
      ),
      characterIds: reconcileBandoriCardFilterSelection(
        storedFilterState.filter.characterIds,
        storedFilterState.availableCharacterIds,
        characterIds,
      ),
      sortBy: hasAvailableSort ? storedFilterState.filter.sortBy : sortValues[0] ?? "id",
      sortDirection: hasAvailableSort ? storedFilterState.filter.sortDirection : "desc",
    };
  }, [bandIds, characterIds, sortValues, storedFilterState]);
  const deferredQuery = useDeferredValue(effectiveFilter.query);
  const deferredFilter = useMemo<BandoriCardPickerFilter>(() => ({
    ...effectiveFilter,
    query: deferredQuery,
  }), [deferredQuery, effectiveFilter]);

  const filteredCards = useMemo(
    () => filterBandoriCardCatalog(catalog, deferredFilter),
    [catalog, deferredFilter],
  );

  const filterKey = useMemo(
    () => JSON.stringify({
      query: deferredQuery,
      bandIds: effectiveFilter.bandIds,
      attributes: effectiveFilter.attributes,
      rarities: effectiveFilter.rarities,
      characterIds: effectiveFilter.characterIds,
      sortBy: effectiveFilter.sortBy,
      sortDirection: effectiveFilter.sortDirection,
    }),
    [deferredQuery, effectiveFilter.attributes, effectiveFilter.bandIds, effectiveFilter.characterIds, effectiveFilter.rarities, effectiveFilter.sortBy, effectiveFilter.sortDirection],
  );

  const selectedCard = useMemo(
    () => catalog.find((card) => (
      card.cardId === value?.cardId
      && card.entityServer === (value?.entityServer ?? null)
    )) ?? null,
    [catalog, value?.cardId, value?.entityServer],
  );
  const virtualGridLayoutKey = useMemo(
    () => [
      showArtToggle ? "art-toggle" : "no-art-toggle",
      value?.cardId ?? "no-card",
      value?.entityServer ?? "no-entity-server",
      value?.trainType ?? "no-train-type",
    ].join(":"),
    [showArtToggle, value?.cardId, value?.entityServer, value?.trainType],
  );

  const visibleCount = visibleState.key === filterKey ? visibleState.count : INITIAL_VISIBLE_COUNT;
  const visibleCardCount = Math.min(visibleCount, filteredCards.length);
  const hiddenCardCount = Math.max(0, filteredCards.length - visibleCardCount);

  const updateFilter = (patch: Partial<BandoriCardPickerFilter>) => {
    setStoredFilterState({
      filter: { ...effectiveFilter, ...patch },
      availableBandIds: bandIds,
      availableCharacterIds: characterIds,
    });
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
      entityServer: card.entityServer,
      trainType: resolveCardTrainType(card, previewTrainType),
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      <BandoriCardFilterControls
        filter={effectiveFilter}
        resultCountLabel={t("resultCount", { count: filteredCards.length })}
        bandOptions={bandOptions}
        characterOptions={characterOptions}
        availableBandIds={bandIds}
        availableCharacterIds={characterIds}
        sortOptions={sortOptions}
        onFilterChange={updateFilter}
        onClearFilter={() => setStoredFilterState(null)}
      />

      {value && showArtToggle ? (
        <div className="sticky -top-3 z-80 -mx-3 bg-slate-50/95 px-3 pb-2 pt-3 backdrop-blur-sm sm:-top-5 sm:-mx-5 sm:px-5 sm:pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xs">
            <div className="min-w-0 text-sm text-slate-600">
            {t("currentSelection")}
            <span className="font-semibold text-slate-900">
              {selectedCard
                ? `${selectedCard.displayName} / #${selectedCard.cardId}`
                : t("cardFallback", { cardId: value.cardId })}
            </span>
          </div>
            <ArtToggle
              trainType={previewTrainType}
              normalLabel={t("art.normal")}
              afterTrainingLabel={t("art.afterTraining")}
              onChange={handlePreviewTrainTypeChange}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-[#fffdf1]/72 p-3 shadow-inner">
        {isLoading && catalog.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm font-semibold text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            {t("states.loadingCards")}
          </div>
        ) : filteredCards.length > 0 ? (
          <>
            <VirtualizedBandoriCardGrid
              items={filteredCards}
              visibleLimit={visibleCount}
              scrollElementRef={scrollElementRef}
              layoutKey={virtualGridLayoutKey}
              getKey={(card) => card.cardRef}
              renderItem={(card) => {
                const isSelected = value?.cardId === card.cardId
                  && (value.entityServer ?? null) === card.entityServer;
                const activeTrainType = resolveCardTrainType(card, previewTrainType);
                const skillEffect = resolveBandoriSkillLabel(
                  card.skillId
                    ? skillMetadata?.[String(card.skillId)] ?? undefined
                    : undefined,
                  5,
                  5,
                  preferredServer,
                  server,
                  termsT("unknownSkill"),
                );
                return (
                  <CardGridItem
                    key={card.cardRef}
                    card={card}
                    isSelected={isSelected}
                    isMuted={mutedCardIds?.has(card.cardId) ?? false}
                    activeTrainType={activeTrainType}
                    skillEffectLabel={skillEffect.label}
                    skillEffectLanguageTag={skillEffect.languageTag}
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
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-xs transition hover:border-blue-300 hover:text-blue-600"
                >
                  {t("actions.showMore", { count: Math.min(PAGE_SIZE, hiddenCardCount) })}
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleState({ key: filterKey, count: filteredCards.length })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-xs transition hover:border-blue-300 hover:text-blue-600"
                >
                  {t("actions.showAll")}
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex min-h-56 items-center justify-center text-sm font-semibold text-slate-500">
            {t("states.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
