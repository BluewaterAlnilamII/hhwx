import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import PageShell from "@/components/PageShell";
import LoadingIndicator from "@/components/LoadingIndicator";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import SongsPageClient from "./SongsPageClient";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ournotes.songs" });
  return { title: buildSiteMetadataTitle(t("page.title")) };
}

export default async function OurNotesSongsPage() {
  const t = await getTranslations("ournotes.songs");
  return <Suspense fallback={<PageShell contentClassName="max-w-6xl"><LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-64 border" /></PageShell>}>
    <SongsPageClient />
  </Suspense>;
}
