import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import ServiceStatusPanel from "./ServiceStatusPanel";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.serviceStatus" });
  return { title: t("title"), description: t("description") };
}

export default async function ServiceStatusPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <main className="relative z-10 mx-auto w-full max-w-5xl font-sans">
      <ServiceStatusPanel />
    </main>
  );
}
