import { Suspense } from "react";
import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";
import CardsPageClient from "./CardsPageClient";
import BandoriPageShell from "../BandoriPageShell";

function CardsPageFallback() {
  const t = useTranslations("bandori.cards");
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" />
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
