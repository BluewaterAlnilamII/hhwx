import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import AuthPageContent from "@/components/AuthPageContent";

interface AuthPageFallbackProps {
  section: string;
  title: string;
  description: string;
}

function AuthPageFallback({ section, title, description }: AuthPageFallbackProps) {
  return (
    <main className="relative min-h-full px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-500">{section}</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>
        </div>
        <div className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-sky-100 border-t-sky-500" />
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
    </main>
  );
}

export default async function AuthPage() {
  const t = await getTranslations("auth");

  return (
    <Suspense fallback={<AuthPageFallback section={t("section")} title={t("loading.title")} description={t("loading.description")} />}>
      <AuthPageContent />
    </Suspense>
  );
}
