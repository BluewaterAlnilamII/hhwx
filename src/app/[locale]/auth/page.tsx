import { AccountFormPage } from "@/components/AccountForm";
import LoadingIndicator from "@/components/LoadingIndicator";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import AuthPageContent from "@/components/AuthPageContent";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AuthPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

interface AuthPageFallbackProps {
  backLabel: string;
  loadingLabel: string;
}

function AuthPageFallback({ backLabel, loadingLabel }: AuthPageFallbackProps) {
  return (
    <AccountFormPage backHref="/" backLabel={backLabel}>
      <LoadingIndicator label={loadingLabel} />
    </AccountFormPage>
  );
}

export async function generateMetadata({ params, searchParams }: AuthPageProps): Promise<Metadata> {
  const [{ locale }, { mode }] = await Promise.all([params, searchParams]);
  const [t, authT] = await Promise.all([
    getTranslations({ locale, namespace: "metadata.auth" }),
    getTranslations({ locale, namespace: "auth.mode" }),
  ]);
  const authMode = Array.isArray(mode) ? mode[0] : mode;
  return {
    title: buildSiteMetadataTitle(authT(authMode === "register" ? "register.title" : authMode === "forgot-password" ? "forgotPassword.title" : "login.title")),
    description: t("description"),
  };
}

export default async function AuthPage() {
  const t = await getTranslations("auth");

  return (
    <Suspense fallback={<AuthPageFallback backLabel={t("actions.backHome")} loadingLabel={t("loading.label")} />}>
      <AuthPageContent />
    </Suspense>
  );
}
