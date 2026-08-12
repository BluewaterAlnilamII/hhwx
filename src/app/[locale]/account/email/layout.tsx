import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AccountEmailLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AccountEmailLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.accountEmail" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function AccountEmailLayout({ children }: AccountEmailLayoutProps) {
  return <>{children}</>;
}
