import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type BandoriSongLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: Pick<BandoriSongLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.songs" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function BandoriSongLayout({ children }: BandoriSongLayoutProps) {
  return <>{children}</>;
}
