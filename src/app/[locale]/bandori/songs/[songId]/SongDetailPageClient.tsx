"use client";

import { useEffect, useTransition } from "react";
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
import {
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import { cn } from "@/lib/utils";

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
  const preferredTextServer: BandoriServer = locale === "en" ? 1 : 3;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isDifficultyPending, startDifficultyTransition] = useTransition();
  const activeView = searchParams.get("view") === "simulator" ? "simulator" : "info";
  const title = pickBandoriRegionalText(
    titleSlots,
    preferredTextServer,
    preferredTextServer,
  ) ?? t("unknownTitle", { songId });
  const bandName = pickBandoriRegionalText(
    bandNameSlots,
    preferredTextServer,
    preferredTextServer,
  ) ?? t("unknownBand");
  const selectedOption = difficulties.find((option) => option.difficulty === selectedDifficulty)
    ?? difficulties[0];
  const playLevel = selectedOption.playLevels.find((value) => value !== null)
    ?? null;

  useEffect(() => {
    const rawView = searchParams.get("view");
    const hasInvalidView = rawView !== null && rawView !== "simulator";
    if (!hasInvalidView && !searchParams.has("server")) return;
    const next = new URLSearchParams(searchParams.toString());
    if (hasInvalidView) next.delete("view");
    next.delete("server");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const selectDifficulty = (difficulty: BandoriChartDifficulty) => {
    if (difficulty === selectedDifficulty) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("difficulty", difficulty);
    startDifficultyTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  };

  const selectView = (view: "info" | "simulator") => {
    if (view === activeView) return;
    const next = new URLSearchParams(searchParams.toString());
    if (view === "info") next.delete("view");
    else next.set("view", view);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
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
      </article>

      <div role="tablist" aria-label={t("detail.view.label")} className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)] shadow-sm dark:border-slate-700 dark:bg-[#111827]">
        {(["info", "simulator"] as const).map((view) => {
          const active = view === activeView;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectView(view)}
              className={cn(
                "relative h-14 text-base font-black outline-hidden transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-control-border-accent)]",
                active
                  ? "text-[var(--theme-color-tab-foreground-selected)]"
                  : "text-[var(--theme-color-tab-foreground)] hover:bg-[var(--theme-color-tab-background-hover)] hover:text-[var(--theme-color-tab-foreground-hover)] dark:text-slate-300 dark:hover:bg-slate-800",
                view === "info" && "border-r border-[var(--theme-color-border-subtle)] dark:border-slate-700",
              )}
            >
              {t(`detail.view.${view}`)}
              {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--theme-color-tab-indicator-selected)]" /> : null}
            </button>
          );
        })}
      </div>

      {activeView === "info" ? (
        <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        </section>
      ) : (
        <ChartSimulatorClientShell {...simulator} />
      )}
    </BandoriPageShell>
  );
}
