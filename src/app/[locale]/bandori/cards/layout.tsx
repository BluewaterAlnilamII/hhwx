import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type BandoriCardsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<BandoriCardsLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "bandori.cards.page" });
  return { title: t("title") };
}

export default function BandoriCardsLayout({ children }: BandoriCardsLayoutProps) {
  return <>{children}</>;
}
