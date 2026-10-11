"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import ChartSimulatorClientShell, {
  type ChartSimulatorClientShellProps,
} from "./ChartSimulatorClientShell";
import { SongDetailHeader, SongDetailTabs, SongStatistics } from "@/components/SongDetailLayout";
import BandoriPageShell from "@/app/[locale]/bandori/BandoriPageShell";
import { usePathname } from "@/i18n/navigation";
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
  simulator: Omit<
    ChartSimulatorClientShellProps,
    "difficulty" | "isActive" | "onDifficultyChange"
  >;
};

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
  const preferredTextServer = useBandoriPreferredServer();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialView = searchParams.get("view") === "simulator" ? "simulator" : "info";
  const [activeView, setActiveView] = useState<"info" | "simulator">(initialView);
  const [hasOpenedSimulator, setHasOpenedSimulator] = useState(initialView === "simulator");
  const [difficulty, setDifficulty] = useState(selectedDifficulty);
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
  const selectedOption = difficulties.find((option) => option.difficulty === difficulty)
    ?? difficulties[0];
  const playLevel = selectedOption.playLevels.find((value) => value !== null)
    ?? null;

  const replaceSearchParams = useCallback((next: URLSearchParams) => {
    const query = next.toString();
    const url = `${query ? `${pathname}?${query}` : pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, [pathname]);

  useEffect(() => {
    const rawView = searchParams.get("view");
    const hasInvalidView = rawView !== null && rawView !== "simulator";
    if (!hasInvalidView && !searchParams.has("server")) return;
    const next = new URLSearchParams(searchParams.toString());
    if (hasInvalidView) next.delete("view");
    next.delete("server");
    replaceSearchParams(next);
  }, [replaceSearchParams, searchParams]);

  useEffect(() => {
    let cancelled = false;
    const preload = () => {
      if (cancelled) return;
      void import("@/lib/bandori/chart-simulator/asset-manifest-client")
        .then(({ loadBandoriChartSimulatorAssets }) => (
          loadBandoriChartSimulatorAssets()
        ))
        .catch(() => {
          // Idle preloading is best-effort; the simulator owns visible errors and retry.
        });
    };
    if (typeof window.requestIdleCallback === "function") {
      const requestId = window.requestIdleCallback(preload, { timeout: 2_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(requestId);
      };
    }
    const timeoutId = window.setTimeout(preload, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const selectDifficulty = (nextDifficulty: BandoriChartDifficulty) => {
    if (nextDifficulty === difficulty) return;
    setDifficulty(nextDifficulty);
    const next = new URLSearchParams(window.location.search);
    next.set("difficulty", nextDifficulty);
    replaceSearchParams(next);
  };

  const selectView = (view: "info" | "simulator") => {
    if (view === activeView) return;
    setActiveView(view);
    if (view === "simulator") setHasOpenedSimulator(true);
    const next = new URLSearchParams(window.location.search);
    if (view === "info") next.delete("view");
    else next.set("view", view);
    replaceSearchParams(next);
  };

  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <SongDetailHeader title={title} bandName={bandName} idLabel={t("songId", { songId })} artworkUrl={artworkUrl}
        difficulties={difficulties.map((option) => ({ difficulty: option.difficulty, label: t(`difficulties.${option.difficulty}`),
          level: option.playLevels.find((value) => value !== null) ?? null }))}
        track={simulator.audioUrl ? {
          id: `bandori:${songId}`, provider: "bandori", providerTrackId: String(songId), title, artist: bandName,
          sourceUrl: simulator.audioUrl, artworkUrl, durationSeconds: simulator.durationSeconds,
        } : null}
        labels={{ artwork: t("artworkAlt", { title }), unavailable: t("artworkUnavailable"), loading: t("states.loading") }} />
      <SongDetailTabs value={activeView} onChange={selectView}
        labels={{ label: t("detail.view.label"), info: t("detail.view.info"), simulator: t("detail.view.simulator") }} />
      <div id="song-panel-info" role="tabpanel" aria-labelledby="song-tab-info" hidden={activeView !== "info"}>
        <section className="hhwx-panel border p-4 sm:p-6">
          <SongStatistics level={playLevel} notes={selectedOption.notes} bpmValues={selectedOption.bpmValues} durationSeconds={simulator.durationSeconds}
            labels={{ level: t("stats.level"), notes: t("stats.notes"), bpm: t("stats.bpm"), duration: t("stats.duration") }} />
        </section>
      </div>

      {hasOpenedSimulator ? (
        <div id="song-panel-simulator" role="tabpanel" aria-labelledby="song-tab-simulator" hidden={activeView !== "simulator"}>
          <ChartSimulatorClientShell
            {...simulator}
            difficulty={difficulty}
            isActive={activeView === "simulator"}
            onDifficultyChange={selectDifficulty}
          />
        </div>
      ) : null}
    </BandoriPageShell>
  );
}
