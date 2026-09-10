import { Suspense } from "react";
import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";
import BandoriPageShell from "../BandoriPageShell";
import SongsPageClient from "./SongsPageClient";

function SongsPageFallback() {
  const t = useTranslations("bandori.songs");
  return (
    <BandoriPageShell contentClassName="max-w-6xl">
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" />
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
