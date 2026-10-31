"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Link } from "@/i18n/navigation";
import HelpPopover from "@/components/HelpPopover";
import { SONG_DIFFICULTY_CLASSES } from "@/components/SongDifficultyStrip";
import { formatSongMetaTime, type SongMetaRow, type SongMetaSort } from "@/lib/song-meta";

export default function SongMetaTable({ game, rows, sort, direction, busy, onSort }: {
  game: "bandori" | "ournotes";
  rows: (SongMetaRow & { topScore: boolean; topEfficiency: boolean })[];
  sort: SongMetaSort; direction: "asc" | "desc"; busy: boolean; onSort: (sort: SongMetaSort) => void;
}) {
  const t = useTranslations(`${game}.songs.meta`), songsT = useTranslations(`${game}.songs`);
  const locale = useLocale();
  const format = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [locale]);
  const bpmFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  return <div className="hhwx-panel overflow-x-auto border" role="region" aria-label={t("tableLabel")} tabIndex={0} aria-busy={busy}>
    <table className="hhwx-meta-table w-full min-w-192 border-collapse text-[13px] leading-5 tabular-nums sm:text-sm">
      <caption className="sr-only">{t("tableLabel")}</caption>
      <thead><tr className="border-b border-[var(--theme-color-border-subtle)] text-[var(--theme-color-text-muted)]">
        <th scope="col" className="w-px min-w-9 whitespace-nowrap px-1 py-2 text-center sm:min-w-11 sm:px-2 sm:py-3">{t("rank")}</th>
        {(["title", "level", "score", "efficiency", "length", "bpm", "notes", "nps", "sr"] as const).map((key) => {
          const hasHelp = ["score", "efficiency", "bpm", "notes", "nps", "sr"].includes(key);
          return <th key={key} scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"}
            className={key === "title" ? "w-full min-w-30 pl-2 pr-5 text-left sm:min-w-41 sm:pl-3 sm:pr-7" : "w-px px-3.5 text-center sm:px-4"}>
            <div className="relative inline-flex items-center gap-0.5 sm:gap-1">
              <button type="button" className="hhwx-text-link min-w-6 whitespace-nowrap py-2 font-bold sm:py-3" onClick={() => onSort(key)}>{t(`columns.${key}`)}<span className="absolute top-1/2 left-full ml-0.5 h-3 w-3 -translate-y-1/2 sm:ml-1" aria-hidden="true">
                {sort === key ? direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
              </span></button>
              {hasHelp ? <div className="flex text-left">
                <HelpPopover label={t("helpLabel", { column: t(`columns.${key}`) })} preferredPlacement="above">
                  {t(`help.${key}`)}
                </HelpPopover>
              </div> : null}
            </div>
          </th>;
        })}
      </tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.songId}:${row.difficulty}`} className="h-10 border-b last:border-0 sm:h-auto">
        <td className="px-1 py-1.5 text-center text-[var(--theme-color-text-muted)] sm:px-2 sm:py-3">{index + 1}</td>
        <th scope="row" className="max-w-0 px-2 py-1.5 text-left font-semibold sm:px-3 sm:py-3"><Link prefetch={false} href={`/${game}/songs/${row.songId}`} className="hhwx-text-link line-clamp-2 break-words sm:line-clamp-none">{row.title || songsT("unknownTitle", { songId: row.songId })}</Link></th>
        <td className="px-2 py-1.5 text-center sm:px-3 sm:py-3"><span className={`${SONG_DIFFICULTY_CLASSES[row.difficulty]} inline-flex min-w-8 items-center justify-center rounded-lg border px-2 py-1 text-xs font-black`}
          title={songsT(`difficulties.${row.difficulty}`)} aria-label={`${songsT(`difficulties.${row.difficulty}`)} ${row.level ?? "—"}`}>{row.level ?? "—"}</span></td>
        <td className={`whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3${row.topScore ? " font-bold" : ""}`}>{format.format(row.score)}%</td>
        <td className={`whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3${row.topEfficiency ? " font-bold" : ""}`}>{format.format(row.efficiency)}%</td>
        <td className="min-w-20 whitespace-nowrap px-2 py-1.5 text-center sm:min-w-22 sm:px-3 sm:py-3">{formatSongMetaTime(row.length)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3" title={row.bpmValues.map((value) => bpmFormat.format(value)).join(" / ")}>{row.bpm === null ? "—" : bpmFormat.format(row.bpm)}{row.bpmValues.length > 1 ? "*" : ""}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.notes ?? "—"}</td><td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{row.nps === null ? "—" : format.format(row.nps)}</td>
        <td className="whitespace-nowrap px-2 py-1.5 text-center sm:px-3 sm:py-3">{format.format(row.sr)}%</td>
      </tr>)}</tbody>
    </table>
    {rows.length === 0 ? <p className="p-8 text-center text-sm text-[var(--theme-color-text-muted)]">{t("empty")}</p> : null}
  </div>;
}
