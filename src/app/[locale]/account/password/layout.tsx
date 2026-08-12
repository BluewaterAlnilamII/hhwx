import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AccountPasswordLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AccountPasswordLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.accountPassword" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function AccountPasswordLayout({ children }: AccountPasswordLayoutProps) {
  return <>{children}</>;
}
