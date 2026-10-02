import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import LoadingIndicator from "@/components/LoadingIndicator";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import CardsPageClient from "./CardsPageClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ournotes.cards" });
  return { title: buildSiteMetadataTitle(t("title")) };
}
export default async function OurNotesCardsPage() {
  const t = await getTranslations("ournotes.cards");
  return <Suspense fallback={<PageShell contentClassName="max-w-6xl"><LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /></PageShell>}>
    <CardsPageClient />
  </Suspense>;
}
