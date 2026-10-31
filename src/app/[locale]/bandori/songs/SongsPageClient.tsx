"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { SearchX } from "lucide-react";
import LoadingIndicator from "@/components/LoadingIndicator";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import * as Tabs from "@radix-ui/react-tabs";
import BandoriSongMeta from "./_components/BandoriSongMeta";
import {
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
  updateBandoriSongsQuery,
  type BandoriSongsPageFilter,
} from "@/lib/bandori/songs/catalog";
import BandoriPageShell from "../BandoriPageShell";
import BandoriSongDetailedRow from "./_components/BandoriSongDetailedRow";
import BandoriSongFilterControls from "./_components/BandoriSongFilterControls";

function navigate(query: string) {
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
}

const INITIAL_VISIBLE_COUNT = 40;
const PAGE_SIZE = 40;

export default function SongsPageClient() {
  const t = useTranslations("bandori.songs");
  const params = useSearchParams();
  const view = params.get("view") === "meta" ? "meta" : "info";
  return <BandoriPageShell contentClassName="max-w-6xl">
    <h1 className="sr-only">{t("page.title")}</h1>
    <Tabs.Root value={view} onValueChange={(value) => {
      const query = new URLSearchParams(window.location.search);
      if ((query.get("view") === "meta" ? "meta" : "info") === value) return;
      if (value === "meta") query.set("view", value); else query.delete("view");
      window.history.pushState(null, "", window.location.pathname + (query.size ? `?${query}` : "") + window.location.hash);
    }}>
      <Tabs.List aria-label={t("view.label")} className="hhwx-panel grid grid-cols-2 overflow-hidden border border-b-0">
        {(["info", "meta"] as const).map((value) => <Tabs.Trigger key={value} value={value}
          className="relative h-11 text-sm font-black sm:h-14 sm:text-base text-[var(--theme-color-tab-foreground)] outline-hidden transition first:border-r first:border-[var(--theme-color-border-subtle)] hover:bg-[var(--theme-color-tab-background-hover)] hover:text-[var(--theme-color-tab-foreground-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] data-[state=active]:text-[var(--theme-color-tab-foreground-selected)] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-[var(--theme-color-tab-indicator-selected)]">
          {t(`view.${value}`)}
        </Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="info" className="space-y-4 lg:space-y-8"><SongInformation /></Tabs.Content>
      <Tabs.Content value="meta" className="space-y-4 lg:space-y-8"><BandoriSongMeta /></Tabs.Content>
    </Tabs.Root>
  </BandoriPageShell>;
}

function SongInformation() {
  const t = useTranslations("bandori.songs");
  const commonT = useTranslations("common");
  const searchParams = useSearchParams();
  const preferredTextServer = useBandoriPreferredServer();
  const musicMaster = useBandoriMusicMaster();
  const musicAssetIndex = useBandoriMusicAssetIndex();
  const [visibleState, setVisibleState] = useState({ key: "", count: INITIAL_VISIBLE_COUNT });
  const filter = useMemo(
    () => parseBandoriSongsPageFilter(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  useEffect(() => {
    if (!searchParams.has("server")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("server");
    const query = params.toString();
    navigate(query);
  }, [searchParams]);
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

  const updateFilter = (patch: Partial<BandoriSongsPageFilter>) => navigate(updateBandoriSongsQuery(window.location.search, patch));
  const clearFilter = () => updateFilter(parseBandoriSongsPageFilter(new URLSearchParams()));

  return (
    <>

      <BandoriSongFilterControls
        filter={filter}
        resultCountLabel={!musicMaster.loaded ? commonT(musicMaster.error ? "states.loadFailed" : "states.loading") : t("page.resultCount", { count: filteredSongs.length })}
        onFilterChange={updateFilter}
        onClearFilter={clearFilter}
      />

      {musicMaster.error || musicAssetIndex.error ? (
        <div role="alert" className="hhwx-catalog-error rounded-2xl border p-5 text-sm font-bold">
          {commonT(musicMaster.loaded && musicAssetIndex.value ? "states.refreshFailed" : "states.loadFailed")}{" "}
          <button type="button" className="hhwx-text-link" onClick={() => {
            if (musicMaster.error) musicMaster.refresh();
            if (musicAssetIndex.error) musicAssetIndex.refresh();
          }}>{commonT("actions.retry")}</button>
        </div>
      ) : null}
      {musicMaster.error && !musicMaster.loaded ? null : musicMaster.loading ? (
        <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" />
      ) : filteredSongs.length === 0 ? (
        <div className="hhwx-panel flex min-h-64 flex-col items-center justify-center gap-3 border text-center text-[var(--theme-color-text-muted)]">
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
              artworkLoading={musicAssetIndex.loading}
              href={`/bandori/songs/${entry.songId}`}
            />
          ))}
          {remainingCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleState({ key: filterKey, count: visibleCount + PAGE_SIZE })}
              className="hhwx-panel hhwx-catalog-action h-12 w-full border text-sm font-black transition"
            >
              {t("page.showMore", { count: Math.min(PAGE_SIZE, remainingCount) })}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}
