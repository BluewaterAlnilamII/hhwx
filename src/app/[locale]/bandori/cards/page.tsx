import { Suspense } from "react";
import CardsPageClient from "./CardsPageClient";
import BandoriPageShell from "../BandoriPageShell";

function CardsPageFallback() {
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <section
        aria-busy="true"
        className="hhwx-panel min-h-80 animate-pulse border"
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
