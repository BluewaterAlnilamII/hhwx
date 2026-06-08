import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type AuthConfirmLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Pick<AuthConfirmLayoutProps, "params">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.authConfirm" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function AuthConfirmLayout({ children }: AuthConfirmLayoutProps) {
  return <>{children}</>;
}
