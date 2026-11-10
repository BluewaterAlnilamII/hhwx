"use client";

import { Pause, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MusicPlayerItem } from "@/lib/music-player-contract";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";

export const SONG_DIFFICULTY_CLASSES = {
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  normal: "border-sky-200 bg-sky-50 text-sky-700",
  hard: "border-amber-200 bg-amber-50 text-amber-700",
  expert: "border-rose-200 bg-rose-50 text-rose-700",
  special: "border-violet-200 bg-violet-50 text-violet-700",
} as const;

export function getSongDifficultyClassName(game: "bandori" | "ournotes", difficulty: keyof typeof SONG_DIFFICULTY_CLASSES) {
  return game === "bandori" ? `hhwx-bandori-difficulty hhwx-bandori-difficulty-${difficulty}` : SONG_DIFFICULTY_CLASSES[difficulty];
}

export type SongDifficultyStripProps = {
  game: "bandori" | "ournotes";
  difficulties: { difficulty: keyof typeof SONG_DIFFICULTY_CLASSES; label: string; level: number | null }[];
  track: MusicPlayerItem | null;
  playbackLoading?: boolean;
  compact?: boolean;
};

export default function SongDifficultyStrip({ game, difficulties, track, playbackLoading = false, compact = false }: SongDifficultyStripProps) {
  const t = useTranslations("navigation.toolbar.player");
  const commonT = useTranslations("common");
  const playing = useMusicPlayerStore((state) => track !== null && state.currentIndex !== null
    && state.queue[state.currentIndex]?.id === track.id && (state.status === "playing" || state.status === "loading"));
  const full = useMusicPlayerStore((state) => state.queue.length >= 500 && !state.queue.some((item) => item.id === track?.id));
  const label = playbackLoading ? commonT("states.loading") : !track ? t("audioUnavailable") : full ? t("queueFull")
    : playing ? t("pauseSong", { title: track.title }) : t("addAndPlaySong", { title: track.title });
  const playback = <button type="button" title={label} aria-label={label} disabled={!track || full || playbackLoading}
    onClick={() => { if (track) useMusicPlayerStore.getState().playItem(track); }}
    className={`group/play inline-flex shrink-0 items-center justify-center rounded-lg outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 ${compact ? "h-11 w-11" : "h-7 w-7"}`}>
    <span className={`inline-flex items-center justify-center rounded-lg bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)] transition group-hover/play:bg-[var(--theme-color-action-accent-background-hover)] ${compact ? "h-6.5 w-6.5" : "h-7 w-7 shadow-sm"}`}>
      {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="ml-px h-3.5 w-3.5" aria-hidden="true" />}
    </span>
  </button>;
  if (compact) return <div className="relative z-10 flex items-center justify-between gap-1">
    <div className="flex items-center gap-1">
      {(Object.keys(SONG_DIFFICULTY_CLASSES) as (keyof typeof SONG_DIFFICULTY_CLASSES)[]).map((difficulty) => {
        const entry = difficulties.find((item) => item.difficulty === difficulty);
        return entry ? <span key={difficulty} title={`${entry.label} ${entry.level ?? "—"}`} aria-label={`${entry.label} ${entry.level ?? "—"}`}
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center border text-[11px] font-bold tabular-nums ${game === "bandori" ? "rounded-lg" : "rounded-md"} ${getSongDifficultyClassName(game, difficulty)}`}><span>{entry.level ?? "—"}</span></span>
          : <span key={difficulty} aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[var(--theme-color-border-subtle)] text-[var(--theme-color-text-muted)] opacity-35"><X className="h-4 w-4" /></span>;
      })}
    </div>
    {playback}
  </div>;
  return <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
    {difficulties.map(({ difficulty, label, level }) => <span key={difficulty} title={`${label} ${level ?? "—"}`}
      className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11px] tabular-nums sm:px-2 ${game === "bandori" ? "font-bold" : "font-black sm:rounded-full"} ${getSongDifficultyClassName(game, difficulty)}`}>
      <span className="sr-only sm:not-sr-only">{label}</span><span>{level ?? "—"}</span>
    </span>)}
    {playback}
  </div>;
}
