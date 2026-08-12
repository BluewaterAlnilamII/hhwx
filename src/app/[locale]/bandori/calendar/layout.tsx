import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type CalendarLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<CalendarLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.calendar" });
  return {
    title: buildSiteMetadataTitle(t("title")),
  };
}

export default function CalendarLayout({ children }: CalendarLayoutProps) {
  return <>{children}</>;
}
