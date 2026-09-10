import Heading from "@/components/Heading";
import LoadingIndicator from "@/components/LoadingIndicator";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import AuthPageContent from "@/components/AuthPageContent";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

type AuthPageProps = {
  params: Promise<{ locale: string }>;
};

interface AuthPageFallbackProps {
  section: string;
  title: string;
  description: string;
}

function AuthPageFallback({ section, title, description }: AuthPageFallbackProps) {
  return (
    <main className="relative min-h-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="hhwx-panel mx-auto max-w-xl border p-8">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[var(--theme-color-action-secondary-foreground)]">{section}</p>
          <Heading as="h1" visualRole="page" className="mt-3">{title}</Heading>
        </div>
        <LoadingIndicator label={description} />
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: AuthPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.auth" });
  return {
    title: buildSiteMetadataTitle(t("title")),
    description: t("description"),
  };
}

export default async function AuthPage() {
  const t = await getTranslations("auth");

  return (
    <Suspense fallback={<AuthPageFallback section={t("section")} title={t("loading.title")} description={t("loading.description")} />}>
      <AuthPageContent />
    </Suspense>
  );
}
