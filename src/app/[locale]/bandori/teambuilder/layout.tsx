import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type TeamBuilderLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<TeamBuilderLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.teamBuilder" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function TeamBuilderLayout({ children }: TeamBuilderLayoutProps) {
  return <>{children}</>;
}
