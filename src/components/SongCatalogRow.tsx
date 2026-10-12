"use client";

import { CalendarDays, ChevronRight, Music2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import SongDifficultyStrip, { type SongDifficultyStripProps } from "@/components/SongDifficultyStrip";

export default function SongCatalogRow({ href, songId, title, bandName, attribute, missions, typeLabel, releaseDate, artworkUrl, artworkLoading = false, labels, difficulties, track, playbackLoading }: {
  href: string; songId: number; title: string; bandName: string; typeLabel: string; releaseDate: string;
  attribute?: { src: string; label: string }; missions?: { text: string; label: string };
  artworkUrl: string | null; artworkLoading?: boolean;
  labels: { artwork: string; unavailable: string; loading: string };
} & SongDifficultyStripProps) {
  return <article className="hhwx-panel hhwx-catalog-row group relative block border p-3 transition sm:p-4">
    <div className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-5">
      <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[var(--theme-shadow-media)] sm:h-24 sm:w-24">
        {artworkUrl ? <MusicArtwork src={artworkUrl} alt={labels.artwork} className="h-full w-full object-cover"
          fallback={<Music2 className="h-7 w-7" aria-label={labels.unavailable} />} />
          : artworkLoading ? <LoadingPlaceholder label={labels.loading} className="h-full w-full" />
            : <Music2 className="h-7 w-7" aria-label={labels.unavailable} />}
      </div>
      <div className="min-w-0 self-stretch py-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="min-w-0 truncate text-base font-black text-[var(--theme-color-text-default)] sm:text-lg"><Link href={href}
            className="outline-hidden after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-[var(--theme-color-focus-ring)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {attribute ? <img src={attribute.src} alt={attribute.label} title={attribute.label} className="mr-1.5 inline-block h-5 w-5 align-[-0.15em] object-contain" loading="lazy" decoding="async" /> : null}
            {title}</Link></h2>
          <span className="text-xs font-bold tabular-nums text-[var(--theme-color-text-muted)]">#{songId}</span>
        </div>
        {missions ? <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-[var(--theme-color-text-muted)]">
          <span className="min-w-0 truncate">{bandName}</span>
          <span aria-label={`${missions.label}: ${missions.text}`} className="inline-flex max-w-full items-baseline gap-2 text-xs font-semibold">
            <span aria-hidden="true" className="shrink-0">·</span><span className="min-w-0 wrap-anywhere">{missions.text}</span>
          </span>
        </div> : <div className="mt-0.5 truncate text-sm font-bold text-[var(--theme-color-text-muted)]">{bandName}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)]">
          <span>{typeLabel}</span>
          <span className="inline-flex items-center gap-1 tabular-nums"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{releaseDate}</span>
        </div>
        <SongDifficultyStrip difficulties={difficulties} track={track} playbackLoading={playbackLoading} />
      </div>
      <ChevronRight className="hidden h-5 w-5 shrink-0 text-[var(--theme-color-text-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--theme-color-action-secondary-foreground)] sm:block" aria-hidden="true" />
    </div>
  </article>;
}
