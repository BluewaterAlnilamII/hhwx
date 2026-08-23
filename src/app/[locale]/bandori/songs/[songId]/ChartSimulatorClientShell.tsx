"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import ChartSimulatorLoadingIndicator from "./ChartSimulatorLoadingIndicator";
import { BANDORI_NATIVE_STAGE_SIZE } from "./native-stage-contract";
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
      className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]"
    >
      <h2 className="text-xl font-black text-[var(--theme-color-text-default)]">
        {t("title")}
      </h2>
      <div
        className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[var(--theme-color-control-background-muted)] ring-1 ring-inset ring-[var(--theme-color-border-subtle)]"
        style={{
          aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
        }}
      >
        <ChartSimulatorLoadingIndicator label={t("loading.simulator")} />
      </div>
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
