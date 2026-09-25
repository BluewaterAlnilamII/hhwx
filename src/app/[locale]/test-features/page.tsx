import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import TestFeaturesPanel from "./TestFeaturesPanel";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.testFeatures" });
  return { title: t("title"), description: t("description") };
}

export default async function TestFeaturesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="relative z-10 mx-auto w-full max-w-5xl font-sans">
      <TestFeaturesPanel />
    </main>
  );
}
