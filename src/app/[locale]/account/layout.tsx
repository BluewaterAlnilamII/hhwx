import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type AccountLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AccountLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.account" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function AccountLayout({ children }: AccountLayoutProps) {
  return <>{children}</>;
}
