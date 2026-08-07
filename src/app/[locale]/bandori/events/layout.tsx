import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type EventTrackerLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<EventTrackerLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.eventtracker" });
  return {
    title: t("title"),
  };
}

export default function EventTrackerLayout({ children }: EventTrackerLayoutProps) {
  return <>{children}</>;
}
