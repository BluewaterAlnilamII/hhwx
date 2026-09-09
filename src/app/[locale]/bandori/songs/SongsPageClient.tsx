"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_DIFFICULTY_FILTERS,
  BANDORI_SONG_TYPES,
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
  type BandoriSongsPageFilter,
} from "@/lib/bandori/songs/catalog";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
} from "@/lib/bandori-server";
import BandoriPageShell from "../BandoriPageShell";
import BandoriSongDetailedRow from "./_components/BandoriSongDetailedRow";
import BandoriSongFilterControls from "./_components/BandoriSongFilterControls";

const INITIAL_VISIBLE_COUNT = 40;
const PAGE_SIZE = 40;

function selectionsEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && right.every((value) => left.includes(value));
}

function setListParam<T extends string | number>(
  params: URLSearchParams,
  key: string,
  values: readonly T[],
  defaults: readonly T[],
): void {
  if (selectionsEqual(values, defaults)) params.delete(key);
  else params.set(key, values.join(","));
}

export default function SongsPageClient() {
  const t = useTranslations("bandori.songs");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const preferredTextServer = useBandoriPreferredServer();
  const musicMaster = useBandoriMusicMaster();
  const musicAssetIndex = useBandoriMusicAssetIndex();
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });
  const filter = useMemo(
    () => parseBandoriSongsPageFilter(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const pendingFilterRef = useRef(filter);
  useEffect(() => {
    pendingFilterRef.current = filter;
  }, [filter]);
  useEffect(() => {
    if (!searchParams.has("server")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("server");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  const deferredQuery = useDeferredValue(filter.query);
  const deferredFilter = useMemo(
    () => ({ ...filter, query: deferredQuery }),
    [deferredQuery, filter],
  );
  const catalog = useMemo(() => buildBandoriSongCatalog(
    musicMaster.music ?? {},
    preferredTextServer,
    {
      unknownTitle: (songId) => t("unknownTitle", { songId }),
      unknownBand: t("unknownBand"),
    },
  ), [musicMaster.music, preferredTextServer, t]);
  const filteredSongs = useMemo(
    () => filterBandoriSongCatalog(catalog, deferredFilter),
    [catalog, deferredFilter],
  );
  const filterKey = useMemo(() => JSON.stringify(deferredFilter), [deferredFilter]);
  const visibleCount = visibleState.key === filterKey ? visibleState.count : INITIAL_VISIBLE_COUNT;
  const visibleSongs = filteredSongs.slice(0, visibleCount);
  const remainingCount = Math.max(0, filteredSongs.length - visibleSongs.length);

  const replaceFilter = (
    nextFilter: BandoriSongsPageFilter,
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("server");
    if (nextFilter.query.trim()) params.set("q", nextFilter.query.trim());
    else params.delete("q");
    setListParam(
      params,
      "available",
      nextFilter.servers.map(getBandoriServerCode),
      BANDORI_SERVERS.map(getBandoriServerCode),
    );
    setListParam(params, "bands", nextFilter.bands, BANDORI_SONG_BAND_FILTERS);
    setListParam(params, "types", nextFilter.types, BANDORI_SONG_TYPES);
    setListParam(params, "difficulty", nextFilter.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS);
    if (nextFilter.minLevel === null) params.delete("minLevel");
    else params.set("minLevel", String(nextFilter.minLevel));
    if (nextFilter.maxLevel === null) params.delete("maxLevel");
    else params.set("maxLevel", String(nextFilter.maxLevel));
    if (nextFilter.sortBy === "id") params.delete("sort");
    else params.set("sort", nextFilter.sortBy);
    if (nextFilter.sortDirection === "desc") params.delete("direction");
    else params.set("direction", nextFilter.sortDirection);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const updateFilter = (patch: Partial<BandoriSongsPageFilter>) => {
    const nextFilter = { ...pendingFilterRef.current, ...patch };
    pendingFilterRef.current = nextFilter;
    replaceFilter(nextFilter);
  };

  const clearFilter = () => {
    pendingFilterRef.current = parseBandoriSongsPageFilter(new URLSearchParams());
    router.replace(pathname, { scroll: false });
  };

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <h1 className="sr-only">{t("page.title")}</h1>

      <BandoriSongFilterControls
        filter={filter}
        resultCountLabel={t("page.resultCount", { count: filteredSongs.length })}
        onFilterChange={updateFilter}
        onClearFilter={clearFilter}
      />

      {musicMaster.error ? (
        <div role="alert" className="hhwx-catalog-error rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {t("states.loadFailed")}
        </div>
      ) : musicMaster.loading ? (
        <div className="hhwx-panel flex min-h-64 items-center justify-center gap-3 border text-sm font-bold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t("states.loading")}
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="hhwx-panel flex min-h-64 flex-col items-center justify-center gap-3 border text-center text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <SearchX className="h-9 w-9" aria-hidden="true" />
          <div className="text-sm font-bold">{t("states.empty")}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSongs.map((entry) => (
            <BandoriSongDetailedRow
              key={entry.songId}
              entry={entry}
              assetIndex={musicAssetIndex.value}
              href={`/bandori/songs/${entry.songId}`}
            />
          ))}
          {remainingCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleState({ key: filterKey, count: visibleCount + PAGE_SIZE })}
              className="hhwx-panel hhwx-catalog-action h-12 w-full border text-sm font-black transition dark:border-sky-900 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
            >
              {t("page.showMore", { count: Math.min(PAGE_SIZE, remainingCount) })}
            </button>
          ) : null}
        </div>
      )}
    </BandoriPageShell>
  );
}
