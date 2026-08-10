"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Images, Loader2, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import BandoriCardFilterControls from "@/components/bandori/BandoriCardFilterControls";
import BandoriCardServerSwitcher from "@/components/bandori/BandoriCardServerSwitcher";
import { BandoriCardDetailedRow } from "@/components/bandori/card-picker";
import { useBandoriCharactersMaster } from "@/hooks/useBandoriCharactersMaster";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriSkillsMaster } from "@/hooks/useBandoriSkillsMaster";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  BANDORI_CARD_CATALOG_TYPES,
  buildBandoriCardsPageCatalog,
  filterBandoriCardsPageCatalog,
  type BandoriCardCatalogType,
  type BandoriCardsPageFilter,
} from "@/lib/bandori-card-catalog";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  buildBandoriCardFilterOptions,
  buildBandoriCardSortValues,
  getBandoriCardReleaseSortBy,
  isBandoriCardAttribute,
  isBandoriCardPickerSortBy,
} from "@/lib/bandori-card-filter";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  getBandoriServerFromCode,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  useBandoriPreferencesStore,
  useBandoriPreferredServer,
} from "@/store/useBandoriPreferencesStore";
import BandoriPageShell from "../BandoriPageShell";
import { useTranslations } from "next-intl";

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

function selectionsEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && right.every((value) => left.includes(value));
}

function setListParam<T extends string | number>(
  params: URLSearchParams,
  key: string,
  values: readonly T[],
  defaults: readonly T[],
): void {
  if (selectionsEqual(values, defaults)) {
    params.delete(key);
  } else {
    params.set(key, values.join(","));
  }
}

export default function CardsPageClient() {
  const t = useTranslations("bandori.cards");
  const filterT = useTranslations("bandori.cardFilters");
  const cardPickerT = useTranslations("bandori.cardPicker");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const preferredServer = useBandoriPreferredServer();
  const setPreferredServer = useBandoriPreferencesStore((state) => state.setPreferredServer);
  const selectedServer = getBandoriServerFromCode(searchParams.get("server")) ?? preferredServer;
  const cardsMaster = useBandoriCardsMaster();
  const charactersMaster = useBandoriCharactersMaster();
  const skillsMaster = useBandoriSkillsMaster();
  const cardsAssetIndex = useBandoriCardsAssetIndex();
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });

  const filterOptions = useMemo(() => buildBandoriCardFilterOptions(
    charactersMaster.data ?? {},
    {
      preferredServer: selectedServer,
      contextServer: selectedServer,
      getBandLabel: (bandId) => filterT("bandFallback", { bandId }),
      getCharacterLabel: (characterId) => filterT("characterFallback", { characterId }),
    },
  ), [charactersMaster.data, filterT, selectedServer]);
  const sortValues = useMemo(
    () => buildBandoriCardSortValues({ shouldIncludePower: false }),
    [],
  );
  const filter = useMemo<BandoriCardsPageFilter>(() => {
    const rawSortBy = searchParams.get("sort");
    const sortBy = rawSortBy && isBandoriCardPickerSortBy(rawSortBy)
      ? rawSortBy
      : getBandoriCardReleaseSortBy(selectedServer);
    const query = searchParams.get("id") ?? searchParams.get("q") ?? "";
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
  }, [filterOptions.bandIds, filterOptions.characterIds, searchParams, selectedServer]);
  const deferredQuery = useDeferredValue(filter.query);
  const deferredFilter = useMemo(
    () => ({ ...filter, query: deferredQuery }),
    [deferredQuery, filter],
  );
  const catalog = useMemo(() => buildBandoriCardsPageCatalog(
    cardsMaster.canonicalData ?? {},
    charactersMaster.data ?? {},
    skillsMaster.data ?? {},
    selectedServer,
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
    selectedServer,
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

  const replaceFilter = (
    nextFilter: BandoriCardsPageFilter,
    options: { queryChanged?: boolean; server?: BandoriServer } = {},
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const server = options.server ?? selectedServer;
    params.set("server", getBandoriServerCode(server));
    if (options.queryChanged) {
      params.delete("id");
      if (nextFilter.query.trim()) params.set("q", nextFilter.query.trim());
      else params.delete("q");
    }
    setListParam(
      params,
      "available",
      nextFilter.servers.map(getBandoriServerCode),
      BANDORI_SERVERS.map(getBandoriServerCode),
    );
    setListParam(params, "bands", nextFilter.bandIds, filterOptions.bandIds);
    setListParam(params, "attributes", nextFilter.attributes, BANDORI_CARD_ATTRIBUTES);
    setListParam(params, "rarities", nextFilter.rarities, BANDORI_CARD_RARITIES);
    setListParam(params, "characters", nextFilter.characterIds, filterOptions.characterIds);
    setListParam(params, "types", nextFilter.types, BANDORI_CARD_CATALOG_TYPES);
    const defaultSort = getBandoriCardReleaseSortBy(server);
    if (nextFilter.sortBy === defaultSort) params.delete("sort");
    else params.set("sort", nextFilter.sortBy);
    if (nextFilter.sortDirection === "desc") params.delete("direction");
    else params.set("direction", nextFilter.sortDirection);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const updateFilter = (patch: Partial<BandoriCardsPageFilter>) => {
    replaceFilter(
      { ...filter, ...patch },
      { queryChanged: patch.query !== undefined },
    );
  };

  const clearFilter = () => {
    const params = new URLSearchParams();
    params.set("server", getBandoriServerCode(selectedServer));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleServerChange = (server: BandoriServer) => {
    setPreferredServer(server);
    const nextFilter = {
      ...filter,
      sortBy: searchParams.has("sort") ? filter.sortBy : getBandoriCardReleaseSortBy(server),
    };
    replaceFilter(nextFilter, { server });
  };

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-5 shadow-[var(--theme-shadow-surface-raised)] sm:p-8 dark:border-slate-700 dark:bg-[#111827]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                <Images className="h-6 w-6" aria-hidden="true" />
              </span>
              <h1 className="text-2xl font-black tracking-tight text-[var(--theme-color-text-default)] sm:text-3xl dark:text-slate-100">
                {t("page.title")}
              </h1>
            </div>
          </div>
          <BandoriCardServerSwitcher
            selectedServer={selectedServer}
            label={t("page.displayServer")}
            onChange={handleServerChange}
          />
        </div>
      </section>

      <BandoriCardFilterControls
        filter={filter}
        resultCountLabel={t("page.resultCount", { count: filteredCards.length })}
        bandOptions={filterOptions.bandOptions}
        characterOptions={filterOptions.characterOptions}
        availableBandIds={filterOptions.bandIds}
        availableCharacterIds={filterOptions.characterIds}
        availableServers={[...BANDORI_SERVERS]}
        sortOptions={sortValues.map((value) => ({ value, label: filterT(`sort.${value}`) }))}
        typeOptions={BANDORI_CARD_CATALOG_TYPES.map((value) => ({
          value,
          label: t(`types.${value}`),
        }))}
        selectedTypes={filter.types}
        onTypesChange={(types) => updateFilter({ types: types as BandoriCardCatalogType[] })}
        onFilterChange={updateFilter}
        onClearFilter={clearFilter}
      />

      {error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {t("states.loadFailed")}
        </div>
      ) : isLoading ? (
        <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-sm font-bold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t("states.loading")}
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-center text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
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
              className="h-12 w-full rounded-2xl border border-sky-200 bg-white text-sm font-black text-sky-700 shadow-xs transition hover:border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
            >
              {t("page.showMore", { count: Math.min(PAGE_SIZE, remainingCount) })}
            </button>
          ) : null}
        </div>
      )}
    </BandoriPageShell>
  );
}
