import { useTranslations } from "next-intl";
import LoadingIndicator from "@/components/LoadingIndicator";

export default function PublicProfileLoading() {
  const t = useTranslations("common");
  return (
    <main className="mx-auto flex min-h-full w-full max-w-4xl items-center py-4 sm:px-6 sm:py-10 lg:px-8">
      <LoadingIndicator label={t("states.loading")} className="hhwx-panel min-h-72 w-full border-y px-4 py-6 sm:border sm:p-8" />
    </main>
  );
}
