"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import BandoriCardFilterControls from "@/components/bandori/BandoriCardFilterControls";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import {
  BANDORI_CARD_CATALOG_TYPES,
  buildBandoriCardsPageCatalog,
  filterBandoriCardsPageCatalog,
  type BandoriCardsPageFilter,
} from "@/lib/bandori/cards/cards-page-catalog";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  buildBandoriCardFilterOptions,
  buildBandoriCardSortValues,
  getBandoriCardReleaseSortBy,
  isBandoriCardAttribute,
  isBandoriCardPickerSortBy,
} from "@/lib/bandori/cards/filter";
import { saveBandoriCardsListQuery, updateBandoriCardsListQuery } from "@/lib/bandori/cards/cards-list-query-snapshot";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  getBandoriServerFromCode,
  type BandoriServer,
} from "@/lib/bandori-server";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import BandoriPageShell from "../BandoriPageShell";
import { useTranslations } from "next-intl";
import BandoriCardDetailedRow from "./_components/BandoriCardDetailedRow";

const INITIAL_VISIBLE_COUNT = 40;
const PAGE_SIZE = 40;

function parseNumberSelection(
  rawValue: string | null,
  availableValues: readonly number[],
): number[] {
  if (rawValue === null) return [...availableValues];
  const availableSet = new Set(availableValues);
  return rawValue.split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && availableSet.has(value));
}

function parseStringSelection<T extends string>(
  rawValue: string | null,
  availableValues: readonly T[],
): T[] {
  if (rawValue === null) return [...availableValues];
  const availableSet = new Set<string>(availableValues);
  return rawValue.split(",").filter((value): value is T => availableSet.has(value));
}

function parseServerSelection(rawValue: string | null): BandoriServer[] {
  if (rawValue === null) return [...BANDORI_SERVERS];
  return rawValue.split(",").flatMap((value) => {
    const server = getBandoriServerFromCode(value);
    return server === null ? [] : [server];
  });
}

function replaceCardsListQuery(query: string): void {
  saveBandoriCardsListQuery(query);
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

export default function CardsPageClient() {
  const t = useTranslations("bandori.cards");
  const filterT = useTranslations("bandori.cardFilters");
  const cardPickerT = useTranslations("bandori.cardPicker");
  const searchParams = useSearchParams();
  const preferredServer = useBandoriPreferredServer();
  const cardsMaster = useBandoriCardsMaster();
  const charactersMaster = useBandoriCharactersMaster();
  const skillsMaster = useBandoriSkillsMaster();
  const cardsAssetIndex = useBandoriCardsAssetIndex();
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });
  const cardsListQuery = searchParams.toString();

  useEffect(() => {
    saveBandoriCardsListQuery(cardsListQuery);
    const params = new URLSearchParams(window.location.search);
    if (params.has("server")) {
      params.delete("server");
      replaceCardsListQuery(params.toString());
    }
  }, [cardsListQuery]);

  const filterOptions = useMemo(() => buildBandoriCardFilterOptions(
    charactersMaster.data ?? {},
    {
      preferredServer,
      contextServer: preferredServer,
      getBandLabel: (bandId) => filterT("bandFallback", { bandId }),
      getCharacterLabel: (characterId) => filterT("characterFallback", { characterId }),
    },
  ), [charactersMaster.data, filterT, preferredServer]);
  const sortValues = useMemo(
    () => buildBandoriCardSortValues({ shouldIncludePower: false }),
    [],
  );
  const filter = useMemo<BandoriCardsPageFilter>(() => {
    const rawSortBy = searchParams.get("sort");
    const sortBy = rawSortBy && isBandoriCardPickerSortBy(rawSortBy)
      ? rawSortBy
      : getBandoriCardReleaseSortBy(preferredServer);
    const legacyId = searchParams.get("id");
    // Existing ID links remain exact after bare numbers gain additional meanings.
    const query = legacyId !== null
      ? /^\d+$/u.test(legacyId) ? `#${legacyId}` : legacyId
      : searchParams.get("q") ?? "";
    return {
      query,
      servers: parseServerSelection(searchParams.get("available")),
      bandIds: parseNumberSelection(searchParams.get("bands"), filterOptions.bandIds),
      attributes: parseStringSelection(
        searchParams.get("attributes"),
        BANDORI_CARD_ATTRIBUTES,
      ).filter(isBandoriCardAttribute),
      rarities: parseNumberSelection(searchParams.get("rarities"), BANDORI_CARD_RARITIES),
      characterIds: parseNumberSelection(searchParams.get("characters"), filterOptions.characterIds),
      types: parseStringSelection(searchParams.get("types"), BANDORI_CARD_CATALOG_TYPES),
      sortBy,
      sortDirection: searchParams.get("direction") === "asc" ? "asc" : "desc",
    };
  }, [filterOptions.bandIds, filterOptions.characterIds, preferredServer, searchParams]);
  const deferredQuery = useDeferredValue(filter.query);
  const deferredFilter = useMemo(
    () => ({ ...filter, query: deferredQuery }),
    [deferredQuery, filter],
  );
  const catalog = useMemo(() => buildBandoriCardsPageCatalog(
    cardsMaster.canonicalData ?? {},
    charactersMaster.data ?? {},
    skillsMaster.data ?? {},
    preferredServer,
    {
      card: (cardId) => cardPickerT("cardFallback", { cardId }),
      character: (characterId) => filterT("characterFallback", { characterId }),
      skill: t("common.noInformation"),
    },
  ), [
    cardPickerT,
    cardsMaster.canonicalData,
    charactersMaster.data,
    filterT,
    preferredServer,
    skillsMaster.data,
    t,
  ]);
  const filteredCards = useMemo(() => filterBandoriCardsPageCatalog(
    catalog,
    deferredFilter,
    filterOptions.bandIds,
    filterOptions.characterIds,
  ), [catalog, deferredFilter, filterOptions.bandIds, filterOptions.characterIds]);
  const filterKey = useMemo(() => JSON.stringify(deferredFilter), [deferredFilter]);
  const visibleCount = visibleState.key === filterKey ? visibleState.count : INITIAL_VISIBLE_COUNT;
  const visibleCards = filteredCards.slice(0, visibleCount);
  const remainingCount = Math.max(0, filteredCards.length - visibleCards.length);
  const isLoading = cardsMaster.loading
    || charactersMaster.loading
    || skillsMaster.loading
    || cardsAssetIndex.loading;
  const error = cardsMaster.error ?? charactersMaster.error ?? skillsMaster.error;

  const updateFilter = (patch: Partial<BandoriCardsPageFilter>) => {
    replaceCardsListQuery(updateBandoriCardsListQuery(window.location.search, patch, filterOptions));
  };

  const clearFilter = () => {
    replaceCardsListQuery("");
  };

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <h1 className="sr-only">{t("page.title")}</h1>

      <BandoriCardFilterControls
        filter={filter}
        resultCountLabel={t("page.resultCount", { count: filteredCards.length })}
        bandOptions={filterOptions.bandOptions}
        characterOptions={filterOptions.characterOptions}
        availableBandIds={filterOptions.bandIds}
        availableCharacterIds={filterOptions.characterIds}
        availableServers={[...BANDORI_SERVERS]}
        sortOptions={sortValues.map((value) => ({ value, label: filterT(`sort.${value}`) }))}
        onFilterChange={updateFilter}
        onClearFilter={clearFilter}
      />

      {error ? (
        <div role="alert" className="hhwx-catalog-error rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {t("states.loadFailed")}
        </div>
      ) : isLoading ? (
        <div className="hhwx-panel flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-sm font-bold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t("states.loading")}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="hhwx-panel flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-center text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <SearchX className="h-9 w-9" aria-hidden="true" />
          <div className="text-sm font-bold">{t("states.empty")}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCards.map((entry) => (
            <BandoriCardDetailedRow
              key={entry.cardRef}
              entry={entry}
              assetIndex={cardsAssetIndex.value}
              typeLabel={t(`types.${entry.type}`)}
              href={`/bandori/cards/${entry.cardId}?server=${getBandoriServerCode(entry.displayServer)}`}
            />
          ))}
          {remainingCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleState({ key: filterKey, count: visibleCount + PAGE_SIZE })}
              className="hhwx-panel hhwx-catalog-action h-12 w-full rounded-2xl border border-sky-200 bg-white text-sm font-black text-sky-700 shadow-xs transition hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
            >
              {t("page.showMore", { count: Math.min(PAGE_SIZE, remainingCount) })}
            </button>
          ) : null}
        </div>
      )}
    </BandoriPageShell>
  );
}
