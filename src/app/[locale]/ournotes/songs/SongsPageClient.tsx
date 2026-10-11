"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SearchX } from "lucide-react";
import PageShell from "@/components/PageShell";
import LoadingIndicator from "@/components/LoadingIndicator";
import SongCatalogRow from "@/components/SongCatalogRow";
import OurNotesSongFilterControls from "@/components/ournotes/OurNotesSongFilterControls";
import { useOurNotesMaster, useOurNotesMusicAssetIndex } from "@/hooks/useOurNotesMaster";
import { useOurNotesPreferencesStore, useOurNotesPreferredServer } from "@/store/useServerPreferencesStore";
import { ourNotesMusicImageUrl } from "@/lib/ournotes/music/assets";
import { buildOurNotesMusicPlayerItem } from "@/lib/ournotes-music-player";
import { buildOurNotesSongCatalog, filterOurNotesSongs, ourNotesSongBandFilters, parseOurNotesSongFilter, updateOurNotesSongsQuery,
  type OurNotesSongFilter } from "@/lib/ournotes/music/catalog";

export default function SongsPageClient() {
  const t = useTranslations("ournotes.songs");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const query = useSearchParams().toString();
  const deferredQuery = useDeferredValue(query);
  const server = useOurNotesPreferredServer();
  const hydrated = useOurNotesPreferencesStore((state) => state.hydrated);
  const music = useOurNotesMaster("music");
  const bands = useOurNotesMaster("bands");
  const images = useOurNotesMusicAssetIndex();
  const [pagination, setPagination] = useState({ query, count: 40 });
  const count = pagination.query === deferredQuery ? pagination.count : 40;
  const options = useMemo(() => ourNotesSongBandFilters(bands.data ?? {}), [bands.data]);
  const filter = useMemo(() => parseOurNotesSongFilter(deferredQuery, options), [deferredQuery, options]);
  const catalog = useMemo(() => buildOurNotesSongCatalog(music.data ?? {}, server), [music.data, server]);
  const results = useMemo(() => filterOurNotesSongs(catalog, filter, bands.data ?? {}), [catalog, filter, bands.data]);
  const ready = hydrated && music.data !== null && bands.data !== null && images.value !== null;
  const failed = music.error || bands.error || images.error;
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }), [locale]);
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (!params.has("server")) return;
    params.delete("server");
    window.history.replaceState(null, "", window.location.pathname + (params.size ? `?${params}` : "") + window.location.hash);
  }, [query]);
  function navigate(next: string) {
    window.history.replaceState(null, "", window.location.pathname + (next ? `?${next}` : "") + window.location.hash);
  }
  function update(patch: Partial<OurNotesSongFilter>) { navigate(updateOurNotesSongsQuery(window.location.search, patch, options)); }
  return <PageShell contentClassName="max-w-6xl">
    <h1 className="sr-only">{t("page.title")}</h1>
    {failed ? <div role="alert" className="hhwx-catalog-error rounded-2xl border p-5 text-sm font-bold">
      {commonT(ready ? "states.refreshFailed" : "states.loadFailed")}{" "}<button type="button" className="hhwx-text-link" onClick={() => {
        if (music.error) music.refresh(); if (bands.error) bands.refresh(); if (images.error) images.refresh();
      }}>{commonT("actions.retry")}</button>
    </div> : null}
    {!ready && !failed ? <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /> : null}
    {ready && bands.data ? <>
      <OurNotesSongFilterControls filter={parseOurNotesSongFilter(query, options)} resultCountLabel={t("page.resultCount", { count: results.length })}
        bands={bands.data} server={server} onFilterChange={update} onClearFilter={() => navigate("")} />
      <div className="space-y-3" aria-busy={query !== deferredQuery}>
        {results.length === 0 ? <div className="hhwx-panel flex min-h-64 flex-col items-center justify-center gap-3 border text-center text-[var(--theme-color-text-muted)]">
          <SearchX className="h-9 w-9" aria-hidden="true" /><div className="text-sm font-bold">{t("states.empty")}</div>
        </div> : null}
        {results.slice(0, count).map((entry) => {
          const title = entry.title || t("unknownTitle", { songId: entry.songId });
          return <SongCatalogRow key={entry.songId} href={`/ournotes/songs/${entry.songId}`} songId={entry.songId} title={title}
            bandName={entry.bandName || t("unknownBand")}
            typeLabel={entry.categories.map((value) => value >= 0 && value <= 6 ? t(`filters.types.${value}`) : t("unknownCategory", { value })).join(" / ") || "—"}
            releaseDate={entry.releaseAt === null ? "—" : dateFormatter.format(entry.releaseAt)} artworkUrl={ourNotesMusicImageUrl(images.value, entry.songId, "thumb")}
            track={buildOurNotesMusicPlayerItem({ songId: entry.songId, title, artist: entry.bandName, assetIndex: images.value })}
            labels={{ artwork: t("artworkAlt", { title }), unavailable: commonT("states.imageUnavailable"), loading: t("states.loading") }}
            difficulties={entry.charts.map((chart) => ({ difficulty: chart.difficulty, label: t(`difficulties.${chart.difficulty}`), level: chart.level }))} />;
        })}
        {count < results.length ? <button type="button" className="hhwx-panel hhwx-catalog-action h-12 w-full border text-sm font-black transition"
          onClick={() => setPagination({ query: deferredQuery, count: count + 40 })}>{t("page.showMore", { count: Math.min(40, results.length - count) })}</button> : null}
      </div>
    </> : null}
  </PageShell>;
}
