import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type OthelloLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<OthelloLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.othello" });
  return {
    title: buildSiteMetadataTitle(t("title")),
    description: t("description"),
  };
}

export default function OthelloLayout({ children }: OthelloLayoutProps) {
  return <>{children}</>;
}
