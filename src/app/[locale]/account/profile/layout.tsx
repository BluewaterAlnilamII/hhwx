import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AccountProfileLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AccountProfileLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.accountProfile" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function AccountProfileLayout({ children }: AccountProfileLayoutProps) {
  return <>{children}</>;
}
