import { Suspense } from "react";
import CardsPageClient from "./CardsPageClient";
import BandoriPageShell from "../BandoriPageShell";

function CardsPageFallback() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section
        aria-busy="true"
        className="animate-pulse rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-5 shadow-[var(--theme-shadow-surface-raised)] sm:p-8 dark:border-slate-700 dark:bg-[#111827]"
      >
        <div className="h-8 w-48 rounded-xl bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 h-4 w-full max-w-xl rounded-lg bg-slate-100 dark:bg-slate-800" />
      </section>
      <section
        aria-hidden="true"
        className="min-h-80 animate-pulse rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700 dark:bg-[#111827]"
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
