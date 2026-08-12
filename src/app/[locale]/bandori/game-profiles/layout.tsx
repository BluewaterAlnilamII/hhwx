import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type GameProfilesLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<GameProfilesLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.gameProfiles" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function GameProfilesLayout({ children }: GameProfilesLayoutProps) {
  return <>{children}</>;
}
