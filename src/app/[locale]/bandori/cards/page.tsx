import { Suspense } from "react";
import CardsPageClient from "./CardsPageClient";
import BandoriPageShell from "../BandoriPageShell";

function CardsPageFallback() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section
        aria-busy="true"
        className="hhwx-panel min-h-80 animate-pulse rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700 dark:bg-[#111827]"
      />
    </BandoriPageShell>
  );
}

export default function BandoriCardsPage() {
  return (
    <Suspense fallback={<CardsPageFallback />}>
      <CardsPageClient />
    </Suspense>
  );
}
