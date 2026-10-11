"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import type { MusicPlayerItem } from "@/lib/music-player-contract";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";

const DIFFICULTY_CLASSES = {
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  normal: "border-sky-200 bg-sky-50 text-sky-700",
  hard: "border-amber-200 bg-amber-50 text-amber-700",
  expert: "border-rose-200 bg-rose-50 text-rose-700",
  special: "border-violet-200 bg-violet-50 text-violet-700",
} as const;

export type SongDifficultyStripProps = {
  difficulties: { difficulty: keyof typeof DIFFICULTY_CLASSES; label: string; level: number | null }[];
  track: MusicPlayerItem | null;
  playbackLoading?: boolean;
};

export default function SongDifficultyStrip({ difficulties, track, playbackLoading = false }: SongDifficultyStripProps) {
  const t = useTranslations("navigation.toolbar.player");
  const commonT = useTranslations("common");
  const playing = useMusicPlayerStore((state) => track !== null && state.currentIndex !== null
    && state.queue[state.currentIndex]?.id === track.id && (state.status === "playing" || state.status === "loading"));
  const full = useMusicPlayerStore((state) => state.queue.length >= 500 && !state.queue.some((item) => item.id === track?.id));
  const label = playbackLoading ? commonT("states.loading") : !track ? t("audioUnavailable") : full ? t("queueFull")
    : playing ? t("pauseSong", { title: track.title }) : t("addAndPlaySong", { title: track.title });
  return <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
    {difficulties.map(({ difficulty, label, level }) => <span key={difficulty} title={`${label} ${level ?? "—"}`}
      className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11px] font-black tabular-nums sm:rounded-full sm:px-2 ${DIFFICULTY_CLASSES[difficulty]}`}>
      <span className="sr-only sm:not-sr-only">{label}</span><span>{level ?? "—"}</span>
    </span>)}
    <button type="button" title={label} aria-label={label} disabled={!track || full || playbackLoading}
      onClick={() => { if (track) useMusicPlayerStore.getState().playItem(track); }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)] shadow-sm outline-hidden transition hover:bg-[var(--theme-color-action-accent-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50">
      {playing ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="ml-px h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  </div>;
}
