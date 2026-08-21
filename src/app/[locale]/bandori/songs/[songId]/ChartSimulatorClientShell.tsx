"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { BandoriChartDifficulty } from "@/lib/bandori-master-contract";

export type ChartSimulatorClientShellProps = {
  songId: number;
  difficulty: BandoriChartDifficulty;
  chartUrl: string;
  audioUrl: string | null;
  durationSeconds: number;
  expectedCombo: number;
};

function LoadingFallback() {
  const t = useTranslations("bandori.songs.simulator");
  return (
    <section
      aria-busy="true"
      className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-6 shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700 dark:bg-[#111827]"
    >
      <div className="h-5 w-40 animate-pulse rounded-full bg-[var(--theme-color-control-background-muted)]" />
      <p className="mt-4 text-sm text-[var(--theme-color-text-muted)]">{t("loading")}</p>
    </section>
  );
}

const ChartSimulatorRuntime = dynamic(() => import("./ChartSimulatorRuntime"), {
  ssr: false,
  loading: LoadingFallback,
});

export default function ChartSimulatorClientShell(props: ChartSimulatorClientShellProps) {
  return <ChartSimulatorRuntime {...props} />;
}
