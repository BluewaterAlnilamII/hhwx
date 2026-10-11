"use client";

import { useLocale, useTranslations } from "next-intl";
import SongCatalogRow from "@/components/SongCatalogRow";
import type { BandoriChartDifficulty } from "@/lib/bandori-master-contract";
import { buildBandoriPublicAssetUrl, type BandoriMusicAssetIndex } from "@/lib/bandori-public-asset-index";
import { getBandoriServerTimeZone } from "@/lib/bandori-server";
import type { BandoriSongCatalogEntry } from "@/lib/bandori/songs/catalog";
import { buildBandoriMusicPlayerItem } from "@/lib/bandori-music-player";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";

export default function BandoriSongDetailedRow({ entry, assetIndex, href, artworkLoading = false }: {
  entry: BandoriSongCatalogEntry; assetIndex: BandoriMusicAssetIndex | null; href: string; artworkLoading?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("bandori.songs");
  const preferredServer = useBandoriPreferredServer();
  const releaseDate = new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(entry.publishedAtServer), year: "numeric", month: "2-digit", day: "2-digit",
  }).format(entry.publishedAt);
  return <SongCatalogRow href={href} songId={entry.songId} title={entry.title} bandName={entry.bandName}
    typeLabel={t(`filters.types.${entry.type}`)} releaseDate={releaseDate}
    artworkUrl={buildBandoriPublicAssetUrl(assetIndex?.songs[String(entry.songId)]?.files.thumb)} artworkLoading={artworkLoading}
    track={buildBandoriMusicPlayerItem({ musicId: entry.songId, assets: assetIndex?.songs[String(entry.songId)],
      preferredServer, fallbackTitle: entry.title, fallbackArtist: entry.bandName })} playbackLoading={artworkLoading}
    labels={{ artwork: t("artworkAlt", { title: entry.title }), unavailable: t("artworkUnavailable"), loading: t("states.loading") }}
    difficulties={Object.entries(entry.difficultyLevels).map(([difficulty, level]) => ({
      difficulty: difficulty as BandoriChartDifficulty, label: t(`difficulties.${difficulty}`), level,
    }))} />;
}
