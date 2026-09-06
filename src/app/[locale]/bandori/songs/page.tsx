import { Suspense } from "react";
import BandoriPageShell from "../BandoriPageShell";
import SongsPageClient from "./SongsPageClient";

function SongsPageFallback() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section
        aria-busy="true"
        className="hhwx-panel min-h-80 animate-pulse rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700 dark:bg-[#111827]"
      />
    </BandoriPageShell>
  );
}

export default function BandoriSongsPage() {
  return (
    <Suspense fallback={<SongsPageFallback />}>
      <SongsPageClient />
    </Suspense>
  );
}
