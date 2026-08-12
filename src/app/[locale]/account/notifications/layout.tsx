import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AccountNotificationsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AccountNotificationsLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.accountNotifications" });
  return { title: buildSiteMetadataTitle(t("title")) };
}

export default function AccountNotificationsLayout({ children }: AccountNotificationsLayoutProps) {
  return <>{children}</>;
}
