"use client";

import { useLocale } from "next-intl";
import { Gauge, ListMusic, Music2, Timer } from "lucide-react";
import Heading from "@/components/Heading";
import LoadingPlaceholder from "@/components/LoadingPlaceholder";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import { cn } from "@/lib/utils";
import SongDifficultyStrip, { type SongDifficultyStripProps } from "@/components/SongDifficultyStrip";

export function SongDetailHeader({ title, bandName, idLabel, artworkUrl, artworkLoading = false, labels, difficulties, track, playbackLoading }: {
  title: string; bandName: string; idLabel: string; artworkUrl: string | null; artworkLoading?: boolean;
  labels: { artwork: string; unavailable: string; loading: string };
} & SongDifficultyStripProps) {
  return <article className="hhwx-panel border p-4 sm:p-6">
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-5">
      <div className="flex aspect-square w-20 items-center justify-center overflow-hidden rounded-2xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[var(--theme-shadow-media)] sm:w-32">
        {artworkUrl ? <MusicArtwork src={artworkUrl} alt={labels.artwork} className="h-full w-full object-cover"
          fallback={<Music2 className="h-8 w-8" aria-label={labels.unavailable} />} />
          : artworkLoading ? <LoadingPlaceholder label={labels.loading} className="h-full w-full" />
            : <Music2 className="h-8 w-8" aria-label={labels.unavailable} />}
      </div>
      <div className="min-w-0 space-y-4"><div>
        <p className="mb-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">{idLabel}</p>
        <Heading as="h1" visualRole="page" className="break-words text-xl sm:text-3xl">{title}</Heading>
        <p className="mt-2 text-sm font-medium text-[var(--theme-color-text-muted)] sm:text-base">{bandName}</p>
        <SongDifficultyStrip difficulties={difficulties} track={track} playbackLoading={playbackLoading} />
      </div></div>
    </div>
  </article>;
}

export function SongDetailTabs({ value, onChange, simulatorDisabled = false, labels }: {
  value: "info" | "simulator"; onChange?: (value: "info" | "simulator") => void; simulatorDisabled?: boolean;
  labels: { label: string; info: string; simulator: string; unavailable?: string };
}) {
  return <div role="tablist" aria-label={labels.label} className="hhwx-panel grid grid-cols-2 overflow-hidden border">
    {(["info", "simulator"] as const).map((view) => <button key={view} id={`song-tab-${view}`} type="button" role="tab"
      aria-selected={view === value} aria-controls={`song-panel-${view}`} tabIndex={view === value ? 0 : -1}
      disabled={view === "simulator" && simulatorDisabled} title={view === "simulator" && simulatorDisabled ? labels.unavailable : undefined}
      onClick={() => onChange?.(view)} onKeyDown={(event) => {
        if (simulatorDisabled || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "info" : event.key === "End" ? "simulator" : view === "info" ? "simulator" : "info";
        onChange?.(next);
        document.getElementById(`song-tab-${next}`)?.focus();
      }}
      className={cn("relative h-14 text-base font-black outline-hidden transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-60",
        view === value ? "text-[var(--theme-color-tab-foreground-selected)]" : "text-[var(--theme-color-tab-foreground)] enabled:hover:bg-[var(--theme-color-tab-background-hover)] enabled:hover:text-[var(--theme-color-tab-foreground-hover)]",
        view === "info" && "border-r border-[var(--theme-color-border-subtle)]")}>
      {labels[view]}{view === value ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--theme-color-tab-indicator-selected)]" /> : null}
    </button>)}
  </div>;
}

export function SongStatistics({ level, notes, bpmValues, durationSeconds, labels }: {
  level: number | null; notes: number | null; bpmValues: readonly number[]; durationSeconds: number | null;
  labels: { level: string; notes: string; bpm: string; duration: string };
}) {
  const locale = useLocale();
  const sorted = [...new Set(bpmValues)].sort((a, b) => a - b);
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const bpm = sorted.length === 0 ? "—" : sorted.length === 1 ? formatter.format(sorted[0]) : `${formatter.format(sorted[0])}–${formatter.format(sorted[sorted.length - 1])}`;
  const seconds = durationSeconds === null ? null : Math.max(0, Math.floor(durationSeconds));
  const duration = seconds === null ? "—" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const items = [
    { id: "level", value: level ?? "—", icon: Gauge }, { id: "notes", value: notes ?? "—", icon: ListMusic },
    { id: "bpm", value: bpm, icon: Music2 }, { id: "duration", value: duration, icon: Timer },
  ] as const;
  return <dl className="hhwx-catalog-statistics grid grid-cols-2 sm:grid-cols-4">
    {items.map(({ id, value, icon: Icon }) => <div key={id} className="bg-[var(--theme-color-control-background-muted)] p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-color-text-muted)]"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{labels[id]}</dt>
      <dd className="mt-1 tabular-nums text-[var(--theme-color-text-default)]">{value}</dd>
    </div>)}
  </dl>;
}

export function SongDifficultyControls<D extends string>({ label, options, value, onChange }: {
  label: string; options: { difficulty: D; label: string }[]; value: D | null; onChange: (value: D) => void;
}) {
  return <div role="group" aria-label={label} className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
    {options.map((option) => <button key={option.difficulty} type="button" aria-pressed={value === option.difficulty} onClick={() => onChange(option.difficulty)}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${value === option.difficulty ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"}`}>
      {option.label}
    </button>)}
  </div>;
}
