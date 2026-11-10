"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Music2 } from "lucide-react";
import Heading from "@/components/Heading";
import SongCatalogRow from "@/components/SongCatalogRow";
import SongMetaTable from "@/components/SongMetaTable";
import { BANDORI_CHART_DIFFICULTIES } from "@/lib/bandori-master-contract";
import type { BandoriMusicMasterMap } from "@/lib/bandori-music-api-client";
import { buildBandoriMusicPlayerItem } from "@/lib/bandori-music-player";
import { buildBandoriPublicAssetUrl, type BandoriMusicAssetIndex } from "@/lib/bandori-public-asset-index";
import { getBandoriServerCode, getBandoriServerTimeZone, type BandoriServer } from "@/lib/bandori-server";
import type { BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import type { BandoriSongMetaDataset } from "@/lib/bandori-song-meta-server";
import { buildEventSongMetaRows, deriveEventSongGroups } from "./eventInfo";

export default function EventSongs({ music, event, server, meta, skills, assets, assetsLoading }: {
  music: BandoriMusicMasterMap; event: Record<string, unknown>; server: BandoriServer;
  meta: BandoriSongMetaDataset; skills: Record<string, BandoriSkillLabelMaster | null | undefined>;
  assets: BandoriMusicAssetIndex | null; assetsLoading: boolean;
}) {
  const t = useTranslations("bandori.events.info"), songsT = useTranslations("bandori.songs");
  const locale = useLocale();
  const selection = useMemo(() => deriveEventSongGroups(music, event, server), [music, event, server]);
  const { sourceServer, groups } = selection;
  const rows = useMemo(() => buildEventSongMetaRows(music, meta, skills, sourceServer), [music, meta, skills, sourceServer]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(sourceServer), year: "numeric", month: "2-digit", day: "2-digit",
  }), [locale, sourceServer]);
  return <section className="event-songs @container mt-6 border-t border-[var(--theme-color-border-subtle)] pt-6">
    <Heading as="h2" visualRole="section" accentSlot="c" icon={<Music2 className="h-5 w-5" />}>
      {t("songsTitle", { server: getBandoriServerCode(sourceServer).toUpperCase() })}
    </Heading>
    <div className="mt-5 space-y-7">
      {groups.filter((group) => group.songs.length > 0).map((group) => {
        const songsById = new Map(group.songs.map((song) => [song.id, song]));
        const groupRows = rows.filter((row) => songsById.get(row.songId)?.difficultyLevels[row.difficulty] !== undefined
          && (group.kind === "special" ? row.difficulty === "special" : ["hard", "expert", "special"].includes(row.difficulty)));
        return <section key={group.kind} data-song-group={group.kind}>
          <Heading as="h3" visualRole="subsection" className="mb-3">{t(`songGroups.${group.kind}`)}</Heading>
          <div className="grid min-w-0 items-start gap-4 @[48rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] @[48rem]:gap-x-8">
            <div className="min-w-0 space-y-2">
              {group.songs.map((song) => <SongCatalogRow key={song.id} compact game="bandori" href={`/bandori/songs/${song.id}`} songId={song.id}
                title={song.title} bandName={song.bandName ?? ""} typeLabel=""
                releaseDate={song.publishedAt === null ? t("unannounced") : t(group.kind === "special" ? "specialAddedAt" : "publishedAt", { date: dateFormat.format(song.publishedAt) })}
                artworkUrl={buildBandoriPublicAssetUrl(assets?.songs[String(song.id)]?.files.thumb)} artworkLoading={assetsLoading}
                track={buildBandoriMusicPlayerItem({ musicId: song.id, music: song.record, assets: assets?.songs[String(song.id)],
                  preferredServer: server, contextServer: sourceServer, fallbackTitle: song.title, fallbackArtist: song.bandName })}
                playbackLoading={assetsLoading}
                labels={{ artwork: songsT("artworkAlt", { title: song.title }), unavailable: songsT("artworkUnavailable"), loading: songsT("states.loading") }}
                difficulties={BANDORI_CHART_DIFFICULTIES.flatMap((difficulty) => {
                  const level = song.difficultyLevels[difficulty];
                  return level === undefined ? [] : [{ difficulty, label: songsT(`difficulties.${difficulty}`), level }];
                })} />)}
            </div>
            <SongMetaTable game="bandori" rows={groupRows} compact />
          </div>
        </section>;
      })}
      {groups.every((group) => group.songs.length === 0) ? <p className="py-6 text-center text-sm text-[var(--theme-color-text-muted)]">{t("noSongs")}</p> : null}
    </div>
  </section>;
}
