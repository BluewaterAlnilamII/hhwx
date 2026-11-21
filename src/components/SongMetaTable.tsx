"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getSongDifficultyClassName } from "@/components/SongDifficultyStrip";
import BandoriFavoriteButton from "@/components/bandori/BandoriFavoriteButton";
import { useBandoriFavoriteKeys } from "@/hooks/useBandoriFavorites";
import { formatSongMetaTime, type SongMetaRow, type SongMetaSort } from "@/lib/song-meta";

const desktopPointer = "(min-width: 48rem) and (hover: hover) and (pointer: fine)";
function subscribeDesktop(notify: () => void) {
  const query = window.matchMedia(desktopPointer);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const isDesktop = () => window.matchMedia(desktopPointer).matches;
const serverDesktop = () => false;

function MetaRow({ compact, rank, href, title, songId, canFavorite, saved, children }: {
  compact?: boolean; rank?: number; href: string; title: string; songId: number; canFavorite: boolean; saved: boolean; children: ReactNode;
}) {
  // Mount the interactive control on demand in tables with thousands of charts.
  const [visited, setVisited] = useState(false);
  const reveal = canFavorite && !visited ? () => setVisited(true) : undefined;
  return <tr className={`group/meta border-b last:border-0 ${compact ? "" : "h-10 sm:h-auto"}`} onPointerEnter={reveal} onFocusCapture={reveal}>
    {rank !== undefined && <td className="px-1 py-1.5 text-center text-[var(--theme-color-text-muted)] sm:px-2 sm:py-3">{rank}</td>}
    <th scope="row" className={`text-left font-semibold ${compact ? "py-2 pr-1 pl-3" : "max-w-0 px-2 py-1.5 sm:px-3 sm:py-3"}`}>
      <div className="flex items-center gap-1">
        <div className={`line-clamp-2 min-w-0 focus-within:line-clamp-none ${compact ? "wrap-anywhere" : "break-words sm:line-clamp-none"}`}>
          <Link prefetch={false} href={href} title={title} className="hhwx-title-link">{title}</Link>
        </div>
        {canFavorite && <span className={`relative flex h-5 w-7 shrink-0 items-center ${saved ? "" : "pointer-events-none opacity-0 group-hover/meta:pointer-events-auto group-hover/meta:opacity-100 group-focus-within/meta:pointer-events-auto group-focus-within/meta:opacity-100 has-[[data-action-feedback]]:opacity-100"}`}>
          {(visited || saved) && <BandoriFavoriteButton kind="songs" id={songId} compact />}
        </span>}
      </div>
    </th>
    {children}
  </tr>;
}

export default function SongMetaTable({ game, rows, sort = "score", direction = "desc", busy = false, onSort, compact = false }: {
  game: "bandori" | "ournotes";
  rows: (SongMetaRow & { scorePercent: number | null; efficiencyPercent: number | null; scoreRank: number; efficiencyRank: number })[];
  sort?: SongMetaSort; direction?: "asc" | "desc"; busy?: boolean; onSort?: (sort: SongMetaSort) => void; compact?: boolean;
}) {
  const t = useTranslations(`${game}.songs.meta`), songsT = useTranslations(`${game}.songs`);
  const locale = useLocale();
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, serverDesktop);
  const canFavorite = game === "bandori" && desktop;
  const favorites = useBandoriFavoriteKeys(canFavorite);
  const rowProps = (row: SongMetaRow) => ({
    href: `/${game}/songs/${row.songId}`, title: row.title || songsT("unknownTitle", { songId: row.songId }),
    songId: row.songId, canFavorite, saved: favorites?.has(`songs:${row.songId}`) ?? false,
  });
  const format = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);
  const bpmFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const formatPercent = (value: number | null) => value === null ? "—" : `${format.format(value)}%`;
  if (compact) return <div className="hhwx-panel @container/meta min-w-0 overflow-hidden border" role="region" aria-label={t("tableLabel")} aria-busy={busy}>
    <table className="hhwx-meta-table w-full table-fixed border-collapse text-xs leading-4 tabular-nums @[26rem]/meta:text-sm @[26rem]/meta:leading-5">
      <caption className="sr-only">{t("tableLabel")}</caption>
      <colgroup><col /><col className="w-8 @[26rem]/meta:w-22" /><col className="w-17.5 @[26rem]/meta:w-22" /><col className="w-17.5 @[26rem]/meta:w-22" /></colgroup>
      <thead className="text-[11px] leading-4 @[26rem]/meta:text-xs @[26rem]/meta:leading-4.5"><tr className="border-b border-[var(--theme-color-border-subtle)] text-[var(--theme-color-text-muted)]">
        {(["title", "level", "score", "efficiency"] as const).map((key) => <th key={key} scope="col" aria-sort={key === "score" ? "descending" : undefined}
          title={key === "level" ? t("columns.level") : undefined}
          className={`py-2.5 ${key === "title" ? "pr-1 pl-3 text-left" : "px-0.5 text-center"}`}>{key === "level" ? t("compactDifficulty") : t(`columns.${key}`)}</th>)}
      </tr></thead>
      <tbody>{rows.map((row) => <MetaRow key={`${row.songId}:${row.difficulty}`} {...rowProps(row)} compact>
        <td className="px-0.5 py-2 text-center"><span className={`${getSongDifficultyClassName(game, row.difficulty)} inline-flex items-center justify-center border text-[11px] @[26rem]/meta:text-xs ${game === "bandori" ? "h-5.5 w-5.5 rounded-lg font-bold @[26rem]/meta:h-6 @[26rem]/meta:w-6" : "h-6 w-6 rounded-md font-black @[26rem]/meta:h-7 @[26rem]/meta:w-7"}`}
          title={songsT(`difficulties.${row.difficulty}`)} aria-label={`${songsT(`difficulties.${row.difficulty}`)} ${row.level ?? "—"}`}><span>{row.level ?? "—"}</span></span></td>
        {(["score", "efficiency"] as const).map((key) => <td key={key} className="px-0.5 py-2 text-center">
          <span className="block whitespace-nowrap font-medium">{formatPercent(row[key === "score" ? "scorePercent" : "efficiencyPercent"])}</span>
          <span className="block text-[10px] leading-4 text-[var(--theme-color-text-muted)] @[26rem]/meta:text-xs" aria-label={t("globalRank", { rank: row[key === "score" ? "scoreRank" : "efficiencyRank"] })}>#{row[key === "score" ? "scoreRank" : "efficiencyRank"]}</span>
        </td>)}
      </MetaRow>)}</tbody>
    </table>
    {rows.length === 0 ? <p className="p-5 text-center text-xs text-[var(--theme-color-text-muted)]">{t("empty")}</p> : null}
  </div>;
  return <div className="hhwx-panel overflow-x-auto border" role="region" aria-label={t("tableLabel")} tabIndex={0} aria-busy={busy}>
    <table className="hhwx-meta-table w-full min-w-192 border-collapse text-[13px] leading-5 tabular-nums sm:text-sm">
      <caption className="sr-only">{t("tableLabel")}</caption>
      <thead><tr className="border-b border-[var(--theme-color-border-subtle)] text-[var(--theme-color-text-muted)]">
        <th scope="col" className="w-px min-w-9 whitespace-nowrap px-1 py-2 text-center sm:min-w-11 sm:px-2 sm:py-3">{t("rank")}</th>
        {(["title", "level", "score", "efficiency", "length", "bpm", "notes", "nps", "sr"] as const).map((key) => <th key={key} scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}
            className={key === "title" ? "w-full min-w-30 pl-2 pr-5 text-left sm:min-w-41 sm:pl-3 sm:pr-7" : "w-px px-3.5 text-center sm:px-4"}>
            <div className="relative inline-flex items-center gap-0.5 sm:gap-1">
              <button type="button" className="hhwx-text-link min-w-6 whitespace-nowrap py-2 font-medium text-inherit sm:py-3" onClick={() => onSort?.(key)}>{t(`columns.${key}`)}<span className="absolute top-1/2 left-full ml-0.5 h-3 w-3 -translate-y-1/2 sm:ml-1" aria-hidden="true">
                {sort === key ? direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
              </span></button>
            </div>
          </th>)}
      </tr></thead>
      <tbody>{rows.map((row, index) => <MetaRow key={`${row.songId}:${row.difficulty}`} {...rowProps(row)} rank={index + 1}>
        <td className="px-2 py-1.5 text-center sm:px-3 sm:py-3"><span className={`${getSongDifficultyClassName(game, row.difficulty)} inline-flex items-center justify-center rounded-lg border ${game === "bandori" ? "h-5.5 w-5.5 text-[11px] font-bold sm:h-6 sm:w-6 sm:text-xs" : "min-w-8 px-2 py-1 text-xs font-black"}`}
          title={songsT(`difficulties.${row.difficulty}`)} aria-label={`${songsT(`difficulties.${row.difficulty}`)} ${row.level ?? "—"}`}><span>{row.level ?? "—"}</span></span></td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{formatPercent(row.scorePercent)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{formatPercent(row.efficiencyPercent)}</td>
        <td className="min-w-20 whitespace-nowrap px-2 py-1.5 text-center sm:min-w-22 sm:px-3 sm:py-3">{formatSongMetaTime(row.length)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3" title={row.bpmValues.map((value) => bpmFormat.format(value)).join(" / ")}>{row.bpm === null ? "—" : bpmFormat.format(row.bpm)}{row.bpmValues.length > 1 ? "*" : ""}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.notes ?? "—"}</td><td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.nps === null ? "—" : format.format(row.nps)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{format.format(row.sr)}%</td>
      </MetaRow>)}</tbody>
    </table>
    {rows.length === 0 ? <p className="p-8 text-center text-sm text-[var(--theme-color-text-muted)]">{t("empty")}</p> : null}
  </div>;
}
