"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Gauge, ListMusic, Music2, Timer } from "lucide-react";
import ChartSimulatorClientShell, {
  type ChartSimulatorClientShellProps,
} from "./ChartSimulatorClientShell";
import BandoriPageShell from "@/app/[locale]/bandori/BandoriPageShell";
import Heading from "@/components/Heading";
import MusicArtwork from "@/components/music-player/MusicArtwork";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { BandoriChartDifficulty } from "@/lib/bandori-master-contract";
import { pickBandoriRegionalText } from "@/lib/bandori-server";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";

export type SongDetailRegionalTextSlots = [
  string | null,
  string | null,
  string | null,
  string | null,
];

export type SongDetailDifficultyOption = {
  difficulty: BandoriChartDifficulty;
  playLevels: [number | null, number | null, number | null, number | null];
  notes: number;
  bpmValues: number[];
};

type SongDetailPageClientProps = {
  songId: number;
  titleSlots: SongDetailRegionalTextSlots;
  bandNameSlots: SongDetailRegionalTextSlots;
  artworkUrl: string | null;
  difficulties: SongDetailDifficultyOption[];
  selectedDifficulty: BandoriChartDifficulty;
  simulator: ChartSimulatorClientShellProps;
};

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function formatBpm(values: readonly number[], locale: string): string {
  const sorted = [...new Set(values)].sort((left, right) => left - right);
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  if (sorted.length === 0) return "—";
  if (sorted.length === 1) return formatter.format(sorted[0]);
  return `${formatter.format(sorted[0])}–${formatter.format(sorted.at(-1) ?? sorted[0])}`;
}

export default function SongDetailPageClient({
  songId,
  titleSlots,
  bandNameSlots,
  artworkUrl,
  difficulties,
  selectedDifficulty,
  simulator,
}: SongDetailPageClientProps) {
  const t = useTranslations("bandori.songs");
  const locale = useLocale();
  const preferredServer = useBandoriPreferredServer();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDifficultyPending, startDifficultyTransition] = useTransition();
  const title = pickBandoriRegionalText(titleSlots, preferredServer) ?? t("unknownTitle", { songId });
  const bandName = pickBandoriRegionalText(bandNameSlots, preferredServer) ?? t("unknownBand");
  const selectedOption = difficulties.find((option) => option.difficulty === selectedDifficulty)
    ?? difficulties[0];
  const playLevel = selectedOption.playLevels[preferredServer]
    ?? selectedOption.playLevels.find((value) => value !== null)
    ?? null;

  const selectDifficulty = (difficulty: BandoriChartDifficulty) => {
    if (difficulty === selectedDifficulty) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("difficulty", difficulty);
    startDifficultyTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  const statistics = [
    { id: "level", value: playLevel ?? "—", icon: Gauge },
    { id: "notes", value: selectedOption.notes, icon: ListMusic },
    { id: "bpm", value: formatBpm(selectedOption.bpmValues, locale), icon: Music2 },
    { id: "duration", value: formatDuration(simulator.durationSeconds), icon: Timer },
  ] as const;

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <article className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]">
        <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
          <div className="flex aspect-square w-32 items-center justify-center overflow-hidden rounded-2xl bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] shadow-[var(--theme-shadow-media)]">
            {artworkUrl ? (
              <MusicArtwork
                src={artworkUrl}
                alt={t("artworkAlt", { title })}
                className="h-full w-full object-cover"
                fallback={<Music2 className="h-8 w-8" aria-label={t("artworkUnavailable")} />}
              />
            ) : (
              <Music2 className="h-8 w-8" aria-label={t("artworkUnavailable")} />
            )}
          </div>
          <div className="min-w-0 space-y-4">
            <div>
              <p className="mb-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">{t("songId", { songId })}</p>
              <Heading as="h1" visualRole="page" className="break-words">{title}</Heading>
              <p className="mt-2 text-sm font-medium text-[var(--theme-color-text-muted)] sm:text-base">{bandName}</p>
            </div>
            <div aria-label={t("difficultyLabel")} className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {difficulties.map((option) => {
                const selected = option.difficulty === selectedDifficulty;
                return (
                  <button
                    key={option.difficulty}
                    type="button"
                    aria-pressed={selected}
                    disabled={isDifficultyPending}
                    onClick={() => selectDifficulty(option.difficulty)}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${selected ? "border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"}`}
                  >
                    {t(`difficulties.${option.difficulty}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {statistics.map(({ id, value, icon: Icon }) => (
            <div key={id} className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-3">
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-color-text-muted)]">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(`stats.${id}`)}
              </dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-[var(--theme-color-text-default)]">{value}</dd>
            </div>
          ))}
        </dl>
      </article>
      <ChartSimulatorClientShell {...simulator} />
    </BandoriPageShell>
  );
}
