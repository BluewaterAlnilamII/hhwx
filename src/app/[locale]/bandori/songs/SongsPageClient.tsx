"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ListMusic, Loader2, SearchX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { usePathname, useRouter } from "@/i18n/navigation";
import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_TYPES,
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
  type BandoriSongsPageFilter,
} from "@/lib/bandori/songs/catalog";
import {
  getBandoriServerCode,
  getBandoriServerFromCode,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  useBandoriPreferencesStore,
  useBandoriPreferredServer,
} from "@/store/useBandoriPreferencesStore";
import BandoriPageShell from "../BandoriPageShell";
import BandoriCardServerSwitcher from "../cards/_components/BandoriCardServerSwitcher";
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
  const preferredServer = useBandoriPreferredServer();
  const setPreferredServer = useBandoriPreferencesStore((state) => state.setPreferredServer);
  const selectedServer = getBandoriServerFromCode(searchParams.get("server")) ?? preferredServer;
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
  const deferredQuery = useDeferredValue(filter.query);
  const deferredFilter = useMemo(
    () => ({ ...filter, query: deferredQuery }),
    [deferredQuery, filter],
  );
  const catalog = useMemo(() => buildBandoriSongCatalog(
    musicMaster.music ?? {},
    selectedServer,
    {
      unknownTitle: (songId) => t("unknownTitle", { songId }),
      unknownBand: t("unknownBand"),
    },
  ), [musicMaster.music, selectedServer, t]);
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
    options: { server?: BandoriServer } = {},
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const server = options.server ?? selectedServer;
    params.set("server", getBandoriServerCode(server));
    if (nextFilter.query.trim()) params.set("q", nextFilter.query.trim());
    else params.delete("q");
    setListParam(params, "bands", nextFilter.bands, BANDORI_SONG_BAND_FILTERS);
    setListParam(params, "types", nextFilter.types, BANDORI_SONG_TYPES);
    if (nextFilter.difficulty === "all") params.delete("difficulty");
    else params.set("difficulty", nextFilter.difficulty);
    if (nextFilter.minLevel === null) params.delete("minLevel");
    else params.set("minLevel", String(nextFilter.minLevel));
    if (nextFilter.maxLevel === null) params.delete("maxLevel");
    else params.set("maxLevel", String(nextFilter.maxLevel));
    if (nextFilter.sortBy === "release") params.delete("sort");
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
    const params = new URLSearchParams({ server: getBandoriServerCode(selectedServer) });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleServerChange = (server: BandoriServer) => {
    setPreferredServer(server);
    replaceFilter(pendingFilterRef.current, { server });
  };

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-5 shadow-[var(--theme-shadow-surface-raised)] sm:p-8 dark:border-slate-700 dark:bg-[#111827]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
              <ListMusic className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-[var(--theme-color-text-default)] sm:text-3xl dark:text-slate-100">
              {t("page.title")}
            </h1>
          </div>
          <BandoriCardServerSwitcher
            selectedServer={selectedServer}
            label={t("page.displayServer")}
            onChange={handleServerChange}
          />
        </div>
      </section>

      <BandoriSongFilterControls
        filter={filter}
        resultCountLabel={t("page.resultCount", { count: filteredSongs.length })}
        onFilterChange={updateFilter}
        onClearFilter={clearFilter}
      />

      {musicMaster.error ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {t("states.loadFailed")}
        </div>
      ) : musicMaster.loading ? (
        <div className="flex min-h-64 items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-sm font-bold text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          {t("states.loading")}
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] text-center text-[var(--theme-color-text-muted)] dark:border-slate-700 dark:bg-[#111827]">
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
              displayServer={selectedServer}
              href={`/bandori/songs/${entry.songId}?server=${getBandoriServerCode(selectedServer)}`}
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
