"use client";

import { CalendarDays, ChevronRight, Music2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import { Link } from "@/i18n/navigation";
import type { BandoriChartDifficulty } from "@/lib/bandori-master-contract";
import {
  buildBandoriPublicAssetUrl,
  type BandoriMusicAssetIndex,
} from "@/lib/bandori-public-asset-index";
import { getBandoriServerTimeZone } from "@/lib/bandori-server";
import type { BandoriSongCatalogEntry } from "@/lib/bandori/songs/catalog";

const DIFFICULTY_CLASSES: Record<BandoriChartDifficulty, string> = {
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  normal: "border-sky-200 bg-sky-50 text-sky-700",
  hard: "border-amber-200 bg-amber-50 text-amber-700",
  expert: "border-rose-200 bg-rose-50 text-rose-700",
  special: "border-violet-200 bg-violet-50 text-violet-700",
};

type BandoriSongDetailedRowProps = {
  entry: BandoriSongCatalogEntry;
  assetIndex: BandoriMusicAssetIndex | null;
  href: string;
};

export default function BandoriSongDetailedRow({
  entry,
  assetIndex,
  href,
}: BandoriSongDetailedRowProps) {
  const locale = useLocale();
  const t = useTranslations("bandori.songs");
  const artworkUrl = buildBandoriPublicAssetUrl(
    assetIndex?.songs[String(entry.songId)]?.files.thumb,
  );
  const releaseDate = new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(entry.publishedAtServer),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(entry.publishedAt);

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-3 shadow-[var(--theme-shadow-surface-raised)] outline-hidden transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_16px_34px_rgba(15,23,42,0.11)] focus-visible:ring-2 focus-visible:ring-sky-400 sm:p-4 dark:border-slate-700 dark:bg-[#111827]"
    >
      <article className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[var(--theme-shadow-media)] sm:h-24 sm:w-24">
          {artworkUrl ? (
            <MusicArtwork
              src={artworkUrl}
              alt={t("artworkAlt", { title: entry.title })}
              className="h-full w-full object-cover"
              fallback={<Music2 className="h-7 w-7" aria-label={t("artworkUnavailable")} />}
            />
          ) : (
            <Music2 className="h-7 w-7" aria-label={t("artworkUnavailable")} />
          )}
        </div>

        <div className="min-w-0 self-stretch py-0.5">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="min-w-0 truncate text-base font-black text-[var(--theme-color-text-default)] sm:text-lg dark:text-slate-100">
              {entry.title}
            </h2>
            <span className="text-xs font-bold tabular-nums text-[var(--theme-color-text-muted)] dark:text-slate-400">
              #{entry.songId}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-[var(--theme-color-text-muted)] dark:text-slate-300">
            {entry.bandName}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-slate-400">
            <span>{t(`filters.types.${entry.type}`)}</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {releaseDate}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(entry.difficultyLevels).map(([difficulty, level]) => (
              <span
                key={difficulty}
                className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black tabular-nums ${DIFFICULTY_CLASSES[difficulty as BandoriChartDifficulty]}`}
              >
                {t(`difficulties.${difficulty}`)} {level}
              </span>
            ))}
          </div>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-500 dark:text-slate-600" aria-hidden="true" />
      </article>
    </Link>
  );
}
